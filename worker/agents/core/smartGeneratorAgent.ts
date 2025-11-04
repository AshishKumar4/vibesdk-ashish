import { BaseProjectAgent } from './baseProjectAgent';
import { SimpleCodeGeneratorAgent } from './simpleGeneratorAgent';
import { SimpleWorkflowGeneratorAgent } from './simpleWorkflowGeneratorAgent';
import { CodeGenState, WorkflowGenState } from './state';
import { AgentInitArgs } from './types';
import { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import { FileConceptType } from '../schemas';
import { CodingAgentInterface } from '../services/implementations/CodingAgent';
import { AppBuilderAgentInterface } from '../services/implementations/AppBuilderAgentInterface';

/**
 * SmartCodeGeneratorAgent - Polymorphic router for app and workflow agents
 * Routes to the appropriate concrete agent based on projectType
 */
export class SmartCodeGeneratorAgent extends BaseProjectAgent<CodeGenState | WorkflowGenState> {
    private activeAgent!: SimpleCodeGeneratorAgent | SimpleWorkflowGeneratorAgent;

    /**
     * Initialize the appropriate agent based on projectType
     */
    async initialize(args: AgentInitArgs): Promise<CodeGenState | WorkflowGenState> {
        if (args.projectType === 'workflow') {
            this.activeAgent = new SimpleWorkflowGeneratorAgent(this.ctx, this.env);
            const state = await this.activeAgent.initialize(args);
            this.setState(state);
            return state;
        } else {
            this.activeAgent = new SimpleCodeGeneratorAgent(this.ctx, this.env);
            const state = await this.activeAgent.initialize(args, args.agentMode || 'deterministic');
            this.setState(state);
            return state;
        }
    }

    // Satisfy BaseProjectAgent abstract methods (delegated via proxy)
    getProjectType(): 'app' | 'workflow' {
        return this.activeAgent?.getProjectType() || 'app';
    }

    getTemplateDetails(): TemplateDetails {
        return this.activeAgent.getTemplateDetails();
    }

    getOperationOptions() {
        return this.activeAgent.getOperationOptions();
    }

    getAgentInterface(): CodingAgentInterface | AppBuilderAgentInterface {
        return this.activeAgent.getAgentInterface();
    }

    async generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ) {
        return this.activeAgent.generateFiles(phaseName, phaseDescription, requirements, files);
    }

    async generateReadme(): Promise<void> {
        return this.activeAgent.generateReadme();
    }

    async onExecutedCommandsHook(commands: string[]): Promise<void> {
        return this.activeAgent.onExecutedCommandsHook(commands);
    }

    /**
     * Check if agent has been initialized
     */
    isInitialized(): boolean {
        return this.activeAgent !== undefined;
    }
}