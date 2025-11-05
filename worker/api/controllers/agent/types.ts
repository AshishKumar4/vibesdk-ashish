import { PreviewType } from "../../../services/sandbox/sandboxTypes";
import type { ImageAttachment } from '../../../types/image-attachment';
import { ProjectType } from 'worker/agents/core/types';

export interface CodeGenArgs {
    query: string;
    language?: string;
    frameworks?: string[];
    selectedTemplate?: string;
    agentMode?: 'deterministic' | 'smart';
    projectType?: ProjectType;
    images?: ImageAttachment[];
}

/**
 * Data structure for connectToExistingAgent response
 */
export interface AgentConnectionData {
    websocketUrl: string;
    agentId: string;
}

export interface AgentPreviewResponse extends PreviewType {
}
    