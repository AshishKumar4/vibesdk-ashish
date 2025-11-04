import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { FileConceptType } from "worker/agents/schemas";
import { ExecuteCommandsResponse, StaticAnalysisResponse, RuntimeError } from "worker/services/sandbox/sandboxTypes";
import { IBaseAgent } from "../interfaces/IBaseAgent";
import { BaseOperationOptions } from "worker/agents/operations/common";
import { DeepDebugResult } from "worker/agents/core/types";
import { RenderToolCall } from "worker/agents/operations/UserConversationProcessor";
import { WebSocketMessageResponses } from "worker/agents/constants";

/**
 * CodingAgentInterface - Generic wrapper for base agent tool calls
 * Works with any agent implementing IBaseAgent (workflows, etc.)
 * For app-specific agents, use AppBuilderAgentInterface instead
 */
export class CodingAgentInterface {
    protected agent: IBaseAgent;
    
    constructor(agent: IBaseAgent) {
        this.agent = agent;
    }

    getLogs(reset?: boolean, durationSeconds?: number): Promise<string> {
        return this.agent.getLogs(reset, durationSeconds);
    }

    fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]> {
        return this.agent.fetchRuntimeErrors(clear);
    }

    async deployPreview(clearLogs: boolean = true, forceRedeploy: boolean = false): Promise<string> {
        const response = await this.agent.deployToSandbox([], forceRedeploy, undefined, clearLogs);
        if (response && response.previewURL) {
            this.agent.broadcast(WebSocketMessageResponses.PREVIEW_FORCE_REFRESH, {});
            return `Deployment successful: ${response.previewURL}`;
        }
        return `Failed to deploy: ${response?.tunnelURL}`;
    }

    async deployToCloudflare(): Promise<string> {
        const response = await this.agent.deployToCloudflare();
        if (response && response.deploymentUrl) {
            return `Deployment successful: ${response.deploymentUrl}`;
        }
        return `Failed to deploy: ${response?.workersUrl}`;
    }

    queueRequest(request: string, images?: ProcessedImageAttachment[]): void {
        this.agent.queueUserRequest(request, images);
    }

    clearConversation(): void {
        this.agent.clearConversation();
    }

    getOperationOptions(): BaseOperationOptions {
        return this.agent.getOperationOptions();
    }

    getGit() {
        return this.agent.getGit();
    }

    updateProjectName(newName: string): Promise<boolean> {
        return this.agent.updateProjectName(newName);
    }

    readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }> {
        return this.agent.readFiles(paths);
    }

    runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse> {
        return this.agent.runStaticAnalysisCode(files);
    }

    execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse> {
        return this.agent.execCommands(commands, shouldSave, timeout);
    }

    generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        return this.agent.generateFiles(phaseName, phaseDescription, requirements, files);
    }

    isCodeGenerating(): boolean {
        return this.agent.isCodeGenerating();
    }

    waitForGeneration(): Promise<void> {
        return this.agent.waitForGeneration();
    }

    isDeepDebugging(): boolean {
        return this.agent.isDeepDebugging();
    }

    waitForDeepDebug(): Promise<void> {
        return this.agent.waitForDeepDebug();
    }

    executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[]
    ): Promise<DeepDebugResult> {
        return this.agent.executeDeepDebug(issue, toolRenderer, streamCb, focusPaths);
    }
}
