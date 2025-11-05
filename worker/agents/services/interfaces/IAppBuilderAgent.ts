import { ICodingAgent } from './ICodingAgent';
import { Blueprint } from '../../schemas';
import { OperationOptions } from '../../operations/common';

/**
 * IAppBuilderAgent - Interface for app-specific agent methods
 * Extends ICodingAgent with app-specific operations (blueprint, file regeneration)
 */
export interface IAppBuilderAgent extends ICodingAgent {
    /**
     * Update project blueprint
     */
    updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint>;
    
    /**
     * Get operation options for this agent
     */
    getOperationOptions(): OperationOptions;
    
    /**
     * Regenerate a file to fix issues
     */
    regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }>;
}
