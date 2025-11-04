import type { Blueprint, PhaseConceptType ,
    FileOutputType,
} from '../schemas';
import type { ConversationMessage } from '../inferutils/common';
import type { InferenceContext } from '../inferutils/config.types';

export interface FileState extends FileOutputType {
    lastDiff: string;
}

export interface PhaseState extends PhaseConceptType {
    // deploymentNeeded: boolean;
    completed: boolean;
}

export enum CurrentDevState {
    IDLE,
    PHASE_GENERATING,
    PHASE_IMPLEMENTING,
    REVIEWING,
    FINALIZING,
}

export const MAX_PHASES = 12;

/**
 * Common state fields shared by all project types (apps, workflows, etc.)
 */
export interface BaseProjectState {
    // Identity
    projectName: string;
    query: string;
    sessionId: string;
    hostname: string;

    templateName: string | 'custom';
    
    // Conversation
    conversationMessages: ConversationMessage[];
    
    // Inference context
    inferenceContext: InferenceContext;
    
    // Generation control
    shouldBeGenerating: boolean;
    agentMode: 'deterministic' | 'smart';
    
    // Common file storage
    generatedFilesMap: Record<string, FileState>;
    
    // Common infrastructure
    sandboxInstanceId?: string;
    commandsHistory?: string[];
    lastPackageJson?: string;
    pendingUserInputs: string[];
    projectUpdatesAccumulator: string[];
    
    // Deep debug
    lastDeepDebugTranscript: string | null;
}

/**
 * CodeGenState - App-specific state extending base project state
 */
export interface CodeGenState extends BaseProjectState {
    // App-specific fields
    blueprint: Blueprint;
    generatedPhases: PhaseState[];
    
    mvpGenerated: boolean;
    reviewingInitiated: boolean;
    phasesCounter: number;
    currentDevState: CurrentDevState;
    reviewCycles?: number;
    currentPhase?: PhaseConceptType;
}

export interface WorkflowMetadata {
    name: string;
    description: string;
    params: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'object';
        description: string;
        example?: unknown;
        required: boolean;
    }>;
    bindings?: {
        envVars?: Record<string, {
            type: 'string';
            description: string;
            default?: string;
            required?: boolean;
        }>;
        secrets?: Record<string, {
            type: 'secret';
            description: string;
            required?: boolean;
        }>;
        resources?: Record<string, {
            type: 'kv' | 'r2' | 'd1' | 'queue' | 'ai';
            description: string;
            required?: boolean;
        }>;
    };
}

/**
 * WorkflowGenState - Workflow-specific state extending base project state
 */
export interface WorkflowGenState extends BaseProjectState {
    workflowCode: string | null;
    workflowClassName: string | null;
    workflowMetadata: WorkflowMetadata | null;
    deploymentUrl: string | null;
    deploymentStatus: 'idle' | 'deploying' | 'deployed' | 'failed';
    deploymentError: string | null;
}
