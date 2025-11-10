import { Agent, AgentContext, Connection, ConnectionContext } from 'agents';
import { PhasicCodingAgent } from './phasicCodingAgent';
import { AgenticCodingAgent } from './agenticCodingAgent';
import { CodeGenState, WorkflowGenState } from './state';
import type { ProjectType, AgentInitArgs } from './types';
import type { AgentInfrastructure } from './baseProjectAgent';
import type { TemplateDetails, PreviewType, GitHubPushRequest } from '../../services/sandbox/sandboxTypes';
import type { FileConceptType, FileOutputType } from '../schemas';
import type { AgentSummary } from './types';
import { GitHubExportResult } from 'worker/services/github';

/** 
 * Durable Object router that delegates to project-specific implementations.
 * Acts as infrastructure layer for PhasicCodingAgent ('app') or AgenticCodingAgent ('workflow').
 * 
 * This class is exported as CodeGeneratorAgent for backward compatibility with production.
 */
export class ProjectAgent 
    extends Agent<Env, CodeGenState | WorkflowGenState> 
    implements AgentInfrastructure<CodeGenState | WorkflowGenState> {
    private activeAgent!: PhasicCodingAgent | AgenticCodingAgent;
    private onStartDeferred?: { props?: Record<string, unknown>; resolve: () => void };
    
    initialState: CodeGenState | WorkflowGenState = PhasicCodingAgent.INITIAL_STATE;

    constructor(ctx: AgentContext, env: Env) {
        const projectTypeProp = (ctx.props as Record<string, unknown>)?.projectType as ProjectType | undefined;
        
        if (projectTypeProp === 'workflow') {
            (ProjectAgent.prototype as { initialState: WorkflowGenState }).initialState = 
                AgenticCodingAgent.INITIAL_STATE;
        }
        
        super(ctx, env);
        
        const actualProjectType = this.state.projectType || projectTypeProp || 'app';
        
        if (actualProjectType === 'workflow') {
            // Safe cast: this is a workflow agent with WorkflowGenState
            this.activeAgent = new AgenticCodingAgent(env, this as AgentInfrastructure<WorkflowGenState>);
        } else {
            // Safe cast: this is an app agent with CodeGenState
            this.activeAgent = new PhasicCodingAgent(env, this as AgentInfrastructure<CodeGenState>);
        }
        
        if (this.onStartDeferred) {
            this.activeAgent.onStart(this.onStartDeferred.props)
                .finally(this.onStartDeferred.resolve);
            this.onStartDeferred = undefined;
        }
    }

    sql<T = unknown>(query: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] {
        return super.sql(query, ...values);
    }

    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }
    
    async onStart(props?: Record<string, unknown>): Promise<void> {
        if (!this.activeAgent) {
            return new Promise<void>((resolve) => {
                this.onStartDeferred = { props, resolve };
            });
        }
        return this.activeAgent.onStart(props);
    }

    onConnect(connection: Connection, ctx: ConnectionContext): void | Promise<void> {
        return this.activeAgent.onConnect(connection, ctx);
    }

    async onMessage(connection: Connection, message: string): Promise<void> {
        return this.activeAgent.onMessage(connection, message);
    }

    async onClose(connection: Connection): Promise<void> {
        return this.activeAgent.onClose(connection);
    }
    
    // RPC Methods - delegated to activeAgent
    getProjectType(): ProjectType { return this.activeAgent.getProjectType(); }
    getTemplateDetails(): TemplateDetails { return this.activeAgent.getTemplateDetails(); }
    ensureTemplateDetails(): Promise<TemplateDetails> { return this.activeAgent.ensureTemplateDetails(); }
    getOperationOptions() { return this.activeAgent.getOperationOptions(); }
    getFullState(): Promise<CodeGenState | WorkflowGenState> { return this.activeAgent.getFullState(); }
    isInitialized(): Promise<boolean> { return this.activeAgent.isInitialized(); }
    initialize(args: AgentInitArgs): Promise<CodeGenState | WorkflowGenState> { 
        return this.activeAgent.initialize(args as never); 
    }
    getSummary(): Promise<AgentSummary> { return this.activeAgent.getSummary(); }
    getPreviewUrlCache(): string { return this.activeAgent.getPreviewUrlCache(); }
    generateFiles(phaseName: string, phaseDescription: string, requirements: string[], files: FileConceptType[]) {
        return this.activeAgent.generateFiles(phaseName, phaseDescription, requirements, files);
    }
    generateReadme(): Promise<void> { return this.activeAgent.generateReadme(); }
    onExecutedCommandsHook(commands: string[]): Promise<void> { return this.activeAgent.onExecutedCommandsHook(commands); }
    deployToSandbox(files?: FileOutputType[], redeploy?: boolean, commitMessage?: string, clearLogs?: boolean): Promise<PreviewType | null> {
        return this.activeAgent.deployToSandbox(files, redeploy, commitMessage, clearLogs);
    }
    pushToGitHub(request: GitHubPushRequest): Promise<GitHubExportResult> { return this.activeAgent.pushToGitHub(request); }
    getGitHubToken() { return this.activeAgent.getGitHubToken(); }
    exportGitObjects() { return this.activeAgent.exportGitObjects(); }
}