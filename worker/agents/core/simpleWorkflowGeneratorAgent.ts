import { AgentContext } from 'agents';
import { BaseProjectAgent } from './baseProjectAgent';
import { WorkflowGenState, WorkflowMetadata } from './state';
import { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import { generateWorkflowScaffold, extractWorkflowClassName } from '../utils/workflowScaffold';
import { CodingAgentInterface } from '../services/implementations/CodingAgent';
import { FileConceptType } from '../schemas';
import { BaseOperationOptions } from '../operations/common';
import { DeploymentManager } from '../services/implementations/DeploymentManager';
import { generateProjectName } from '../utils/templateCustomizer';
import { generateNanoId } from 'worker/utils/idGenerator';
import { WorkflowContext } from '../domain/values/WorkflowContext';
import { IBaseAgent } from '../services/interfaces/IBaseAgent';
import { WorkflowAgentInitArgs } from './types';
import { InferenceContext } from '../inferutils/config.types';

export class SimpleWorkflowGeneratorAgent extends BaseProjectAgent<WorkflowGenState> implements IBaseAgent {
    private static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;
    
    private templateDetailsCache: TemplateDetails | null = null;
    protected codingAgent = new CodingAgentInterface(this);
    
    getProjectType(): 'app' | 'workflow' {
        return 'workflow';
    }
    
    initialState: WorkflowGenState = {
        projectName: '',
        query: '',
        sessionId: '',
        hostname: '',
        templateName: 'workflow',
        conversationMessages: [],
        inferenceContext: {} as InferenceContext,
        shouldBeGenerating: false,
        agentMode: 'deterministic',
        generatedFilesMap: {},
        sandboxInstanceId: undefined,
        commandsHistory: [],
        lastPackageJson: '',
        pendingUserInputs: [],
        projectUpdatesAccumulator: [],
        lastDeepDebugTranscript: null,
        workflowCode: null,
        workflowClassName: null,
        workflowMetadata: null,
        deploymentUrl: null,
        deploymentStatus: 'idle',
        deploymentError: null
    };
    
    constructor(ctx: AgentContext, env: Env) {
        super(ctx, env);
    }
    
    /**
     * Returns synthesized workflow scaffold
     * Regenerates whenever workflow code changes
     */
    getTemplateDetails(): TemplateDetails {
        if (!this.templateDetailsCache) {
            this.templateDetailsCache = generateWorkflowScaffold({
                workflowName: this.state.projectName,
                workflowClassName: this.state.workflowClassName || 'MyWorkflow',
                workflowCode: this.state.workflowCode || undefined,
                metadata: this.state.workflowMetadata || undefined
            });
        }
        return this.templateDetailsCache;
    }

    async ensureTemplateDetails(): Promise<TemplateDetails> {
        return this.getTemplateDetails();
    }
    
    /**
     * Regenerate template when workflow code changes
     */
    private updateTemplateDetails(): void {
        this.templateDetailsCache = generateWorkflowScaffold({
            workflowName: this.state.projectName,
            workflowClassName: this.state.workflowClassName || extractWorkflowClassName(this.state.workflowCode || ''),
            workflowCode: this.state.workflowCode || undefined,
            metadata: this.state.workflowMetadata || undefined
        });
    }
    
    async initialize(args: WorkflowAgentInitArgs): Promise<WorkflowGenState> {
        const { query, hostname, inferenceContext } = args;
        const sandboxSessionId = DeploymentManager.generateNewSessionId();
        this.initLogger(inferenceContext.agentId, sandboxSessionId, inferenceContext.userId);
        
        const projectName = generateProjectName(
            'workflow',
            generateNanoId(),
            SimpleWorkflowGeneratorAgent.PROJECT_NAME_PREFIX_MAX_LENGTH
        );
        
        this.logger().info('Initializing workflow agent', { projectName, query });
        
        this.setState({
            ...this.initialState,
            projectName,
            query,
            sessionId: sandboxSessionId,
            hostname,
            inferenceContext,
            templateName: 'workflow'
        });
        
        await this.gitInit();
        
        const scaffold = this.getTemplateDetails();
        await this.fileManager.saveGeneratedFiles(
            Object.entries(scaffold.allFiles).map(([filePath, fileContents]) => ({
                filePath,
                fileContents,
                filePurpose: 'Workflow scaffold file'
            })),
            'Initialize workflow scaffold'
        );
        
        const filesToDeploy = Object.entries(scaffold.allFiles).map(([filePath, fileContents]) => ({
            filePath,
            fileContents,
            filePurpose: 'Workflow scaffold file'
        }));
        
        await this.deployToSandbox(filesToDeploy, false, 'workflow-scaffold', true);
        
        return this.state;
    }
    
    /**
     * Update workflow code and regenerate files
     */
    async updateWorkflowCode(code: string, metadata: WorkflowMetadata): Promise<void> {
        this.logger().info('Updating workflow code', { 
            workflowName: metadata.name,
            hasParams: !!metadata.params,
            hasBindings: !!metadata.bindings
        });
        
        const className = extractWorkflowClassName(code);
        
        this.setState({
            ...this.state,
            workflowCode: code,
            workflowClassName: className,
            workflowMetadata: metadata
        });
        
        this.updateTemplateDetails();
        
        const updatedScaffold = this.getTemplateDetails();
        const filesToUpdate = [
            {
                filePath: 'src/index.ts',
                fileContents: updatedScaffold.allFiles['src/index.ts'],
                filePurpose: 'Workflow implementation with HTTP handler'
            },
            {
                filePath: 'wrangler.jsonc',
                fileContents: updatedScaffold.allFiles['wrangler.jsonc'],
                filePurpose: 'Workflow configuration with bindings'
            },
            {
                filePath: 'README.md',
                fileContents: updatedScaffold.allFiles['README.md'],
                filePurpose: 'Workflow documentation'
            }
        ];
        
        await this.fileManager.saveGeneratedFiles(
            filesToUpdate,
            `Update workflow: ${metadata.name}`
        );
        
        await this.deployToSandbox(filesToUpdate, true, metadata.name, true);
    }
    
    getOperationOptions(): BaseOperationOptions {
        const templateDetails = this.getTemplateDetails();
        const context = WorkflowContext.from(
            this.state,
            templateDetails,
            templateDetails.deps
        );
        
        return {
            env: this.env,
            agentId: this.getAgentId(),
            context,
            logger: this.logger(),
            inferenceContext: this.getInferenceContext(),
            agent: this.codingAgent
        };
    }
    
    getAgentInterface(): CodingAgentInterface {
        return this.codingAgent;
    }
    
    async generateFiles(
        _phaseName: string,
        _phaseDescription: string,
        _requirements: string[],
        _files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        this.logger().warn('generateFiles called on workflow agent - workflows use updateWorkflowCode instead');
        return { files: [] };
    }
    
    async generateReadme(): Promise<void> {
        if (!this.state.workflowMetadata) {
            this.logger().info('No workflow metadata available for README generation');
            return;
        }
        
        this.updateTemplateDetails();
        const scaffold = this.getTemplateDetails();
        
        await this.fileManager.saveGeneratedFile({
            filePath: 'README.md',
            fileContents: scaffold.allFiles['README.md'],
            filePurpose: 'Workflow documentation'
        }, 'Generate README');
    }
    
    async onExecutedCommandsHook(_commands: string[]): Promise<void> {
        this.logger().info('Commands executed in workflow agent', { 
            commandCount: _commands.length 
        });
    }
    
}
