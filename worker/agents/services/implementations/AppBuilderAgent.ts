import { CodingAgentInterface } from './CodingAgent';
import { IAppBuilderAgent } from '../interfaces/IAppBuilderAgent';
import { Blueprint } from '../../schemas';
import { OperationOptions } from '../../operations/common';

/**
 * AppBuilderAgentInterface - Wrapper for app-specific agent methods
 */
export class AppBuilderAgentInterface extends CodingAgentInterface {
    private appAgent: IAppBuilderAgent;
    
    constructor(appAgent: IAppBuilderAgent) {
        super(appAgent);
        this.appAgent = appAgent;
    }
    
    // === App-Specific Methods ===
    
    /**
     * Update project blueprint
     */
    async updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint> {
        return this.appAgent.updateBlueprint(patch);
    }
    
    /**
     * Get operation options for this agent
     */
    getOperationOptions(): OperationOptions {
        return this.appAgent.getOperationOptions();
    }
    
    /**
     * Regenerate a file to fix issues
     */
    async regenerateFile(path: string, issues: string[]): Promise<{ path: string; diff: string }> {
        return this.appAgent.regenerateFileByPath(path, issues);
    }
}
