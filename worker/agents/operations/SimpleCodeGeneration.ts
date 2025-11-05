import { FileConceptType, FileOutputType } from '../schemas';
import { createUserMessage, createSystemMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { PROMPT_UTILS } from '../prompts';
import { AgentOperation, BaseOperationOptions } from './common';
import { BaseProjectContext } from '../domain/values/BaseProjectContext';
import { SCOFFormat, SCOFParsingState } from '../output-formats/streaming-formats/scof';
import { CodeGenerationStreamingState } from '../output-formats/streaming-formats/base';
import { FileProcessing } from '../domain/pure/FileProcessing';

export interface SimpleCodeGenerationInputs {
    phaseName: string;
    phaseDescription: string;
    requirements: string[];
    files: FileConceptType[];
    fileGeneratingCallback?: (filePath: string, filePurpose: string) => void;
    fileChunkGeneratedCallback?: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void;
    fileClosedCallback?: (file: FileOutputType, message: string) => void;
}

export interface SimpleCodeGenerationOutputs {
    files: FileOutputType[];
}

const SYSTEM_PROMPT = `You are an expert Cloudflare developer specializing in Cloudflare Workers and Workflows.

Your task is to generate production-ready code based on the provided specifications.

## Project Context
{{projectContext}}

## Template Information
{{template}}

## Critical Guidelines
- Write clean, type-safe TypeScript code
- Follow best practices for the specific project type
- For Workflows: use WorkflowEntrypoint, step.do(), step.sleep() patterns
- For Workers: use standard Worker patterns with Request/Response
- Ensure all imports are correct
- Add proper error handling
- Include JSDoc comments where helpful`;

const USER_PROMPT = `Generate code for the following phase:

**Phase Name:** {{phaseName}}
**Description:** {{phaseDescription}}

**Requirements:**
{{requirements}}

**Files to Generate:**
{{files}}

Generate complete, production-ready code for all specified files.`;

const formatRequirements = (requirements: string[]): string => {
    return requirements.map((req, index) => `${index + 1}. ${req}`).join('\n');
};

const formatFiles = (files: FileConceptType[]): string => {
    return files.map((file, index) => {
        return `${index + 1}. **${file.path}**
   Purpose: ${file.purpose}
   ${file.changes ? `Changes needed: ${file.changes}` : 'Create new file'}`;
    }).join('\n\n');
};

export class SimpleCodeGenerationOperation extends AgentOperation<
    SimpleCodeGenerationInputs,
    SimpleCodeGenerationOutputs
> {
    async execute(
        inputs: SimpleCodeGenerationInputs,
        options: BaseOperationOptions<BaseProjectContext>
    ): Promise<SimpleCodeGenerationOutputs> {
        const { phaseName, phaseDescription, requirements, files } = inputs;
        const { env, logger, context, inferenceContext } = options;

        logger.info('Generating code via LLM', {
            phaseName,
            phaseDescription,
            fileCount: files.length,
            requirementCount: requirements.length
        });

        // Build project context
        const projectContext = context.templateDetails 
            ? PROMPT_UTILS.serializeTemplate(context.templateDetails)
            : 'No template context available';

        // Build system message with context
        const systemPrompt = PROMPT_UTILS.replaceTemplateVariables(SYSTEM_PROMPT, {
            projectContext,
            template: context.templateDetails ? PROMPT_UTILS.serializeTemplate(context.templateDetails) : ''
        });

        // Build user message with requirements
        const userPrompt = PROMPT_UTILS.replaceTemplateVariables(USER_PROMPT, {
            phaseName,
            phaseDescription,
            requirements: formatRequirements(requirements),
            files: formatFiles(files)
        });

        const codeGenerationFormat = new SCOFFormat();
        const messages = [
            createSystemMessage(systemPrompt),
            createUserMessage(userPrompt + codeGenerationFormat.formatInstructions())
        ];

        // Initialize streaming state
        const streamingState: CodeGenerationStreamingState = {
            accumulator: '',
            completedFiles: new Map(),
            parsingState: {} as SCOFParsingState
        };

        const generatedFiles: FileOutputType[] = [];

        // Execute inference with streaming
        await executeInference({
            env,
            context: inferenceContext,
            agentActionName: 'phaseImplementation', // Use existing phase implementation config
            messages,
            stream: {
                chunk_size: 256,
                onChunk: (chunk: string) => {
                    codeGenerationFormat.parseStreamingChunks(
                        chunk,
                        streamingState,
                        // File generation started
                        (filePath: string) => {
                            logger.info(`Starting generation of file: ${filePath}`);
                            if (inputs.fileGeneratingCallback) {
                                const purpose = files.find(f => f.path === filePath)?.purpose || 'Generated file';
                                inputs.fileGeneratingCallback(filePath, purpose);
                            }
                        },
                        // Stream file content chunks
                        (filePath: string, fileChunk: string, format: 'full_content' | 'unified_diff') => {
                            if (inputs.fileChunkGeneratedCallback) {
                                inputs.fileChunkGeneratedCallback(filePath, fileChunk, format);
                            }
                        },
                        // onFileClose callback
                        (filePath: string) => {
                            logger.info(`Completed generation of file: ${filePath}`);
                            const completedFile = streamingState.completedFiles.get(filePath);
                            if (!completedFile) {
                                logger.error(`Completed file not found: ${filePath}`);
                                return;
                            }

                            // Process the file contents
                            const originalContents = context.allFiles.find(f => f.filePath === filePath)?.fileContents || '';
                            completedFile.fileContents = FileProcessing.processGeneratedFileContents(
                                completedFile,
                                originalContents,
                                logger
                            );

                            const generatedFile: FileOutputType = {
                                ...completedFile,
                                filePurpose: files.find(f => f.path === filePath)?.purpose || 'Generated file'
                            };

                            generatedFiles.push(generatedFile);

                            if (inputs.fileClosedCallback) {
                                inputs.fileClosedCallback(generatedFile, `Completed generation of ${filePath}`);
                            }
                        }
                    );
                }
            }
        });

        logger.info('Code generation completed', {
            fileCount: generatedFiles.length
        });

        return {
            files: generatedFiles
        };
    }
}
