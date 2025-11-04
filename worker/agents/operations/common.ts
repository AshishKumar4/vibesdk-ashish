import { StructuredLogger } from "../../logger";
import { PhasicGenerationContext } from "../domain/values/GenerationContext";
import { BaseProjectContext } from "../domain/values/BaseProjectContext";
import { Message } from "../inferutils/common";
import { InferenceContext } from "../inferutils/config.types";
import { createUserMessage, createSystemMessage, createAssistantMessage } from "../inferutils/common";
import { generalSystemPromptBuilder, USER_PROMPT_FORMATTER } from "../prompts";
import { CodeSerializerType } from "../utils/codeSerializers";
import { CodingAgentInterface } from "../services/implementations/CodingAgent";

export function getSystemPromptWithProjectContext(
    systemPrompt: string,
    context: PhasicGenerationContext,
    serializerType: CodeSerializerType = CodeSerializerType.SIMPLE
): Message[] {
    const { query, blueprint, templateDetails, dependencies, allFiles, commandsHistory } = context;

    const messages = [
        createSystemMessage(generalSystemPromptBuilder(systemPrompt, {
            query,
            blueprint,
            templateDetails,
            dependencies,
        })), 
        createUserMessage(
            USER_PROMPT_FORMATTER.PROJECT_CONTEXT(
                context.getCompletedPhases(),
                allFiles, 
                context.getFileTree(),
                commandsHistory,
                serializerType  
            )
        ),
        createAssistantMessage(`I have thoroughly gone through the whole codebase and understood the current implementation and project requirements. We can continue.`)
    ];
    return messages;
}

/**
 * Base operation options - generic over context and agent interface types
 */
export interface BaseOperationOptions<TContext = BaseProjectContext, TAgent = any> {
    env: Env;
    agentId: string;
    context: TContext;
    logger: StructuredLogger;
    inferenceContext: InferenceContext;
    agent: TAgent;
}

/**
 * App-specific operation options
 */
export type OperationOptions = BaseOperationOptions<PhasicGenerationContext, CodingAgentInterface>;

export abstract class AgentOperation<InputType, OutputType> {
    abstract execute(
        inputs: InputType,
        options: OperationOptions
    ): Promise<OutputType>;
}