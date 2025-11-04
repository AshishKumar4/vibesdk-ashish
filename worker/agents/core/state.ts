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
