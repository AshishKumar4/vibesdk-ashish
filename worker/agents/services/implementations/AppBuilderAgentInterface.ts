import { Blueprint } from "worker/agents/schemas";
import { IAppBuilderAgent } from "../interfaces/IAppBuilderAgent";
import { OperationOptions } from "worker/agents/operations/common";
import { CodingAgentInterface } from "./CodingAgent";

/**
 * AppBuilderAgentInterface - Wrapper for app-specific agent tool calls
 * Extends CodingAgentInterface with app-specific methods (blueprint, file regeneration)
 */
export class AppBuilderAgentInterface extends CodingAgentInterface {
    protected declare agent: IAppBuilderAgent;
    
    constructor(agent: IAppBuilderAgent) {
        super(agent);
    }

    getOperationOptions(): OperationOptions {
        return this.agent.getOperationOptions();
    }

    updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint> {
        return this.agent.updateBlueprint(patch);
    }

    regenerateFile(path: string, issues: string[]): Promise<{ path: string; diff: string }> {
        return this.agent.regenerateFileByPath(path, issues);
    }
}
