import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { FileConceptType, FileOutputType } from "worker/agents/schemas";
import { ExecuteCommandsResponse, StaticAnalysisResponse, RuntimeError, PreviewType } from "worker/services/sandbox/sandboxTypes";
import { BaseOperationOptions } from "worker/agents/operations/common";
import { DeepDebugResult, ProjectType } from "worker/agents/core/types";
import { RenderToolCall } from "worker/agents/operations/UserConversationProcessor";
import { GitVersionControl } from "worker/agents/git/git";
import { BaseSandboxService } from "worker/services/sandbox/BaseSandboxService";
import { WebSocketMessageType, WebSocketMessageData } from "worker/api/websocketTypes";

/**
 * ICodingAgent - Interface for methods used by tools and operations
 * 
 * This interface contains only the methods that tools need to call,
 * without any generic state parameters. This allows tools to work
 * with any BaseProjectAgent variant without contravariance issues.
 * 
 * This follows the Interface Segregation Principle - clients should not depend
 * on methods they don't use.
 */
export interface ICodingAgent {
    getProjectType(): ProjectType;
    
    getLogs(reset?: boolean, durationSeconds?: number): Promise<string>;
    
    fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]>;
    
    deployToSandbox(files?: FileOutputType[], redeploy?: boolean, commitMessage?: string, clearLogs?: boolean): Promise<PreviewType | null>;
    
    broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void;
    
    deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null>;
    
    queueUserRequest(request: string, images?: ProcessedImageAttachment[]): void;
    
    queueRequest(request: string, images?: ProcessedImageAttachment[]): void;
    
    deployPreview(clearLogs?: boolean, forceRedeploy?: boolean): Promise<string>;
    
    clearConversation(): void;
    
    updateProjectName(newName: string): Promise<boolean>;
    
    getOperationOptions(): BaseOperationOptions;
    
    readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }>;
    
    runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse>;
    
    execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse>;
    
    generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }>;
    
    isCodeGenerating(): boolean;
    
    waitForGeneration(): Promise<void>;
    
    isDeepDebugging(): boolean;
    
    waitForDeepDebug(): Promise<void>;
    
    executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult>;
    
    getGit(): GitVersionControl;
    
    getSandboxServiceClient(): BaseSandboxService;
}
