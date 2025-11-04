import { ICodingAgent } from './ICodingAgent';
import { Blueprint } from '../../schemas';
import { OperationOptions } from '../../operations/common';

/**
 * IAppBuilderAgent - App-specific extensions to ICoding Agent
 */
export abstract class IAppBuilderAgent extends ICodingAgent {
    /**
     * Update project blueprint
     */
    abstract updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint>;
    
    /**
     * Get operation options for this agent
     */
    abstract getOperationOptions(): OperationOptions;
    
    /**
     * Regenerate a file to fix issues
     */
    abstract regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }>;
}
