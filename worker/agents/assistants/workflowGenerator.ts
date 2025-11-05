import Assistant from './assistant';
import { createSystemMessage, createUserMessage, createAssistantMessage, Message } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { InferenceContext } from '../inferutils/config.types';
import { createObjectLogger } from '../../logger';
import { AGENT_CONFIG } from '../inferutils/config';
import { InferError } from '../inferutils/core';
import { buildDebugTools } from '../tools/customTools';
import type { DebugSession } from './codeDebugger';

const SYSTEM_PROMPT = `You are an expert Cloudflare Workflows developer. Your role is to design and implement production-ready workflows.

## CRITICAL: Communication Mode
- Use your advanced reasoning capabilities for internal analysis
- Output should be CONCISE: brief status updates and tool calls only
- Think deeply internally → Act decisively → Report briefly

## Your Task
Generate a complete Cloudflare Workflow based on the user's requirements.

## Project Context
- This is a **Cloudflare Workers project** using **Cloudflare Workflows**
- Workflows are durable, stateful execution flows that run on Cloudflare's edge
- The project uses the Workflows development platform

## Cloudflare Workflows Overview

Workflows are **durable, stateful execution flows** that:
- Run on Cloudflare Workers infrastructure
- Execute asynchronously with automatic retries
- Can pause/resume execution across steps
- Support timeouts, delays, and external API calls
- Use TypeScript/JavaScript

### Core Workflow Structure

\`\`\`typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

export class MyWorkflow extends WorkflowEntrypoint<Env> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        // Step 1: Do something (automatically retried on failure)
        const result = await step.do('step-name', async () => {
            return await someAsyncOperation();
        });
        
        // Step 2: Sleep/delay
        await step.sleep('wait', 60); // 60 seconds
        
        // Step 3: Use result from previous step
        return await step.do('final-step', async () => {
            return processResult(result);
        });
    }
}
\`\`\`

### Key Patterns

1. **WorkflowEntrypoint<Env>**: Base class - extend with your env type for bindings
2. **step.do(name, fn)**: Execute a retriable step with unique name
3. **step.sleep(name, seconds)**: Delay execution (workflow pauses and resumes)
4. **WorkflowEvent<T>**: Type-safe input via \`event.payload\`
5. **Automatic Retries**: Failed steps retry with exponential backoff - make steps idempotent!

### Bindings Access
Access Cloudflare resources via \`this.env\`:
- \`this.env.MY_KV.get('key')\` - KV storage
- \`this.env.DB.prepare('SELECT...')\` - D1 database
- \`this.env.AI.run('@cf/...', {...})\` - Workers AI
- \`this.env.MY_BUCKET.put('key', data)\` - R2 storage

### Best Practices
1. **Idempotent Steps**: Steps can be retried - ensure they're safe to run multiple times
2. **Unique Step Names**: Each step.do() needs a unique identifier
3. **Small, Focused Steps**: Break complex logic into retriable units
4. **Error Handling**: Let automatic retries handle transient errors
5. **Type Safety**: Define proper TypeScript interfaces for params and return types

## Available Tools

You have access to powerful code generation and testing tools:

- **generate_files**: Generate workflow code via LLM
  - Specify phase name, description, requirements, and files to create
  - The LLM will generate production-ready TypeScript code
  - Files are automatically saved

- **deploy_preview**: Deploy to sandbox for testing
  - Test your workflow in a live environment
  - See execution logs and results

- **read_files**: Read existing code to understand context

- **exec_commands**: Run commands if needed (install deps, etc.)

- **run_analysis**: Static analysis (TypeScript type checking, linting)

- **get_runtime_errors**: Check for runtime errors after deployment

## Workflow Generation Process

1. **Analyze** the user's requirements
2. **Design** the workflow with clear, retriable steps
3. **Generate** code by calling \`generate_files\` tool with:
   - Clear phase name and description
   - Specific requirements
   - File path (src/index.ts) with purpose and changes description
4. **Test** by calling \`deploy_preview\` to verify it works
5. **Verify** using \`run_analysis\` or \`get_runtime_errors\` if needed

## Important Notes

- This is for **Cloudflare Workflows**, not regular Workers
- Always use **WorkflowEntrypoint** and **step.do()** patterns
- Ensure steps are **idempotent** (safe to retry)
- Use **unique step names** for each step.do() call
- Think deeply about error handling and retries

Generate high-quality, production-ready workflow code.`;

const USER_PROMPT = (query: string, projectName: string): string => `Generate a Cloudflare Workflow for the following requirement:

**Requirement:**
${query}

**Project Name:** ${projectName}

**Instructions:**
1. Call the \`generate_files\` tool to create the workflow implementation in src/index.ts
2. Specify clear requirements and what the workflow should accomplish
3. The LLM will generate production-ready Cloudflare Workflow code
4. Optionally, deploy to preview to test it

Generate the workflow now using the tools available to you.`;

export interface WorkflowGeneratorInputs {
    query: string;
    projectName: string;
}

export class WorkflowGenerator extends Assistant<Env> {
    logger = createObjectLogger(this, 'WorkflowGenerator');

    constructor(
        env: Env,
        inferenceContext: InferenceContext
    ) {
        super(env, inferenceContext);
    }

    async run(
        inputs: WorkflowGeneratorInputs,
        session: DebugSession,
        streamCb?: (chunk: string) => void
    ): Promise<string> {
        this.logger.info('Starting workflow generation', {
            query: inputs.query,
            projectName: inputs.projectName
        });

        const system = createSystemMessage(SYSTEM_PROMPT);
        const user = createUserMessage(USER_PROMPT(inputs.query, inputs.projectName));
        const messages: Message[] = this.save([system, user]);

        const logger = this.logger;

        // Build debug tools for workflow generation
        const tools = buildDebugTools(session, logger);

        let out = '';

        try {
            const result = await executeInference({
                env: this.env,
                context: this.inferenceContext,
                agentActionName: 'deepDebugger',
                modelConfig: AGENT_CONFIG.deepDebugger,
                messages,
                tools,
                stream: streamCb
                    ? { chunk_size: 64, onChunk: (c) => streamCb(c) }
                    : undefined,
            });
            out = result?.string || '';
        } catch (e) {
            // If error is an InferError, use the partial response transcript
            if (e instanceof InferError) {
                out = e.partialResponseTranscript();
                logger.info('Partial response transcript', { transcript: out });
            } else {
                throw e;
            }
        }

        this.save([createAssistantMessage(out)]);
        this.logger.info('Workflow generation completed', {
            transcriptLength: out.length
        });

        return out;
    }
}
