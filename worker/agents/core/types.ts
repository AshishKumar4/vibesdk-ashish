
import type { RuntimeError, StaticAnalysisResponse } from '../../services/sandbox/sandboxTypes';
import type { FileOutputType, PhaseConceptType } from '../schemas';
import type { ConversationMessage } from '../inferutils/common';
import type { InferenceContext } from '../inferutils/config.types';
import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import { TemplateSelection } from '../schemas';
import { CurrentDevState } from './state';
import { ProcessedImageAttachment } from 'worker/types/image-attachment';

export type ProjectType = 'app' | 'workflow';

/**
 * Base initialization arguments shared by all agent types
 */
export interface BaseAgentInitArgs {
    query: string;
    hostname: string;
    inferenceContext: InferenceContext;
}

/**
 * App-specific initialization arguments
 */
export interface AppAgentInitArgs extends BaseAgentInitArgs {
    projectType: 'app';
    language?: string;
    frameworks?: string[];
    templateInfo: {
        templateDetails: TemplateDetails;
        selection: TemplateSelection;
    };
    images?: ProcessedImageAttachment[];
    onBlueprintChunk: (chunk: string) => void;
    agentMode?: 'deterministic' | 'smart';
}

/**
 * Workflow-specific initialization arguments
 */
export interface WorkflowAgentInitArgs extends BaseAgentInitArgs {
    projectType: 'workflow';
}

/**
 * Discriminated union of all agent initialization types
 */
export type AgentInitArgs = AppAgentInitArgs | WorkflowAgentInitArgs;

export interface AllIssues {
    runtimeErrors: RuntimeError[];
    staticAnalysis: StaticAnalysisResponse;
}

/**
 * Agent state definition for code generation
 */
export interface ScreenshotData {
    url: string;
    timestamp: number;
    viewport: { width: number; height: number };
    userAgent?: string;
    screenshot?: string; // Base64 data URL from Cloudflare Browser Rendering REST API
}

export interface AgentSummary {
    query: string;
    generatedCode: FileOutputType[];
    conversation: ConversationMessage[];
}

export interface UserContext {
    suggestions?: string[];
    images?: ProcessedImageAttachment[];  // Image URLs
}

export interface PhaseExecutionResult {
    currentDevState: CurrentDevState;
    staticAnalysis?: StaticAnalysisResponse;
    result?: PhaseConceptType;
    userSuggestions?: string[];
    userContext?: UserContext;
}

/**
 * Result type for deep debug operations
 */
export type DeepDebugResult = 
    | { success: true; transcript: string }
    | { success: false; error: string };