import { IBaseAgent } from './IBaseAgent';
import { Blueprint } from '../../schemas';
import { OperationOptions } from '../../operations/common';

/**
 * IAppBuilderAgent - App-specific agent interface
 * Extends IBaseAgent with app-specific methods (blueprint, file regeneration)
 */
export abstract class IAppBuilderAgent extends IBaseAgent {
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
