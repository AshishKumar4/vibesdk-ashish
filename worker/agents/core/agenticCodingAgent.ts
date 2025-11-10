import { BaseProjectAgent, type AgentInfrastructure } from './baseProjectAgent';
import { WorkflowGenState, WorkflowMetadata } from './state';
import { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import { generateWorkflowScaffold, extractWorkflowClassName } from '../utils/workflowScaffold';
import { ICodingAgent } from '../services/interfaces/ICodingAgent';
import { FileConceptType } from '../schemas';
import { BaseOperationOptions } from '../operations/common';
import { DeploymentManager } from '../services/implementations/DeploymentManager';
import { generateProjectName } from '../utils/templateCustomizer';
import { generateNanoId } from 'worker/utils/idGenerator';
import { WorkflowContext } from '../domain/values/WorkflowContext';
import { WorkflowAgentInitArgs } from './types';
import { InferenceContext } from '../inferutils/config.types';
import { WebSocketMessageResponses } from '../constants';
import { SimpleCodeGenerationOperation } from '../operations/SimpleCodeGeneration';
import { WorkflowGenerator } from '../assistants/workflowGenerator';

/**
 * Agentic Coding Agent: LLM-driven workflow generation with tools.
 * Used for workflow projects where the LLM decides what to do using available tools.
 */
export class AgenticCodingAgent extends BaseProjectAgent<WorkflowGenState> {
    private static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;
    
    private templateDetailsCache: TemplateDetails | null = null;
    
    static readonly INITIAL_STATE: WorkflowGenState = {
        projectType: 'workflow',
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
        workflowMetadata: null,
        deploymentUrl: null,
        deploymentStatus: 'idle',
        deploymentError: null
    };
    
    constructor(env: Env, infrastructure: AgentInfrastructure<WorkflowGenState>) {
        super(env, infrastructure);
    }
    
    /**
     * Get workflow code from generated files (src/index.ts)
     * Computed property - avoids duplication in state
     */
    private getWorkflowCode(): string | null {
        return this.state.generatedFilesMap['src/index.ts']?.fileContents || null;
    }
    
    /**
     * Extract workflow class name from the generated code
     */
    private getWorkflowClassName(): string {
        const code = this.getWorkflowCode();
        return code ? extractWorkflowClassName(code) : 'MyWorkflow';
    }
    
    getTemplateDetails(): TemplateDetails {
        if (!this.templateDetailsCache) {
            this.templateDetailsCache = generateWorkflowScaffold({
                workflowName: this.state.projectName,
                workflowClassName: this.getWorkflowClassName(),
                workflowCode: this.getWorkflowCode() || undefined,
                metadata: this.state.workflowMetadata || undefined
            });
        }
        return this.templateDetailsCache;
    }

    async ensureTemplateDetails(): Promise<TemplateDetails> {
        return this.getTemplateDetails();
    }
    
    private updateTemplateDetails(): void {
        this.templateDetailsCache = generateWorkflowScaffold({
            workflowName: this.state.projectName,
            workflowClassName: this.getWorkflowClassName(),
            workflowCode: this.getWorkflowCode() || undefined,
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
            AgenticCodingAgent.PROJECT_NAME_PREFIX_MAX_LENGTH
        );
        
        this.logger().info('Initializing workflow agent', { projectName, query });
        
        this.setState({
            ...AgenticCodingAgent.INITIAL_STATE,
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
            agent: this
        };
    }
    
    getAgentInterface(): ICodingAgent {
        return this;
    }
    
    /**
     * Generate files using SimpleCodeGeneration operation
     */
    async generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        this.logger().info('Generating workflow files', {
            phaseName
        });

        // Broadcast file generation started
        this.broadcast(WebSocketMessageResponses.PHASE_IMPLEMENTING, {
            message: `Generating files: ${phaseName}`,
            phaseName
        });

        const operation = new SimpleCodeGenerationOperation();
        const result = await operation.execute(
            {
                phaseName,
                phaseDescription,
                requirements,
                files,
                fileGeneratingCallback: (filePath: string, filePurpose: string) => {
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
                        message: `Generating file: ${filePath}`,
                        filePath,
                        filePurpose
                    });
                },
                fileChunkGeneratedCallback: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => {
                    this.broadcast(WebSocketMessageResponses.FILE_CHUNK_GENERATED, {
                        message: `Generating file: ${filePath}`,
                        filePath,
                        chunk,
                        format
                    });
                },
                fileClosedCallback: (file, message) => {
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                        message,
                        file
                    });
                }
            },
            this.getOperationOptions()
        );

        await this.fileManager.saveGeneratedFiles(
            result.files,
            `feat: ${phaseName}\n\n${phaseDescription}`
        );

        this.logger().info('Files generated and saved', {
            fileCount: result.files.length
        });

        return {
            files: result.files.map(f => ({
                path: f.filePath,
                purpose: f.filePurpose || '',
                diff: f.fileContents
            }))
        };
    }
    
    /**
     * Configure or update workflow metadata
     * Can be called multiple times to iteratively refine params and bindings
     */
    configureMetadata(metadata: WorkflowMetadata): void {
        this.logger().info('Configuring workflow metadata', {
            name: metadata.name,
            paramsCount: Object.keys(metadata.params).length,
            hasBindings: !!metadata.bindings,
            hasEnvVars: !!metadata.bindings?.envVars,
            hasSecrets: !!metadata.bindings?.secrets,
            hasResources: !!metadata.bindings?.resources
        });
        
        // Merge with existing metadata if present (allows iterative updates)
        const existing = this.state.workflowMetadata;
        const updatedMetadata = existing 
            ? this.mergeMetadata(existing, metadata)
            : metadata;
        
        this.updateState({
            workflowMetadata: updatedMetadata
        });
        
        // Invalidate template cache so next getTemplateDetails() regenerates with new metadata
        this.templateDetailsCache = null;
        
        this.logger().info('Workflow metadata updated', {
            totalParams: Object.keys(updatedMetadata.params).length,
            totalBindings: updatedMetadata.bindings 
                ? Object.keys(updatedMetadata.bindings.envVars || {}).length +
                  Object.keys(updatedMetadata.bindings.secrets || {}).length +
                  Object.keys(updatedMetadata.bindings.resources || {}).length
                : 0
        });
    }
    
    /**
     * Merge existing metadata with updates
     * Allows iterative refinement through conversation
     */
    private mergeMetadata(
        existing: WorkflowMetadata, 
        updates: WorkflowMetadata
    ): WorkflowMetadata {
        return {
            name: updates.name,
            description: updates.description,
            params: { ...existing.params, ...updates.params },
            bindings: updates.bindings ? {
                envVars: { 
                    ...existing.bindings?.envVars, 
                    ...updates.bindings.envVars 
                },
                secrets: { 
                    ...existing.bindings?.secrets, 
                    ...updates.bindings.secrets 
                },
                resources: { 
                    ...existing.bindings?.resources, 
                    ...updates.bindings.resources 
                }
            } : existing.bindings
        };
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
    
    /**
     * Main generation entry point - called by WebSocket GENERATE_ALL
     * Uses LLM with tools (like DeepCodeDebugger) to decide what to do
     */
    async generateAllFiles(): Promise<void> {
        if (this.state.workflowMetadata && this.state.pendingUserInputs.length === 0) {
            this.logger().info("Code generation already completed and no user inputs pending");
            return;
        }
        
        // Check if already generating
        if (this.isCodeGenerating()) {
            this.logger().info('Workflow generation already in progress');
            return;
        }
        
        // Start generation
        this.generationPromise = this.executeGeneration();
        await this.generationPromise;
    }
    
    /**
     * Execute the workflow generation using WorkflowGenerator assistant
     * The assistant uses LLM with tools to decide what to do
     */
    private async executeGeneration(): Promise<void> {
        this.logger().info('Starting workflow generation with assistant', {
            query: this.state.query,
            projectName: this.state.projectName
        });
        
        // Broadcast generation started
        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting workflow generation...',
            totalFiles: 1
        });
        
        try {
            // Create workflow generator assistant
            const generator = new WorkflowGenerator(
                this.env,
                this.state.inferenceContext
            );
            
            // Create debug session for tools
            const session = {
                agent: this,
                filesIndex: Object.values(this.state.generatedFilesMap)
            };
            
            // Run the assistant
            await generator.run(
                {
                    query: this.state.query,
                    projectName: this.state.projectName
                },
                session,
                // Stream callback
                (chunk: string) => {
                    this.broadcast(WebSocketMessageResponses.TEXT_DELTA, {
                        text: chunk
                    });
                }
            );
            
            this.broadcast(WebSocketMessageResponses.GENERATION_COMPLETED, {
                message: 'Workflow generation completed',
                filesGenerated: Object.keys(this.state.generatedFilesMap).length
            });
            
            this.logger().info('Workflow generation completed');
            
        } catch (error) {
            this.logger().error('Workflow generation failed', error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: error instanceof Error ? error.message : 'Unknown error during generation'
            });
            throw error;
        } finally {
            this.generationPromise = null;
            this.clearAbortController();
        }
    }
    
    /**
     * Check if generation is in progress
     */
    isCodeGenerating(): boolean {
        return this.generationPromise !== null;
    }
    
    /**
     * Wait for generation to complete
     */
    async waitForGeneration(): Promise<void> {
        if (this.generationPromise) {
            await this.generationPromise;
        }
    }
    
    /**
     * Deploy workflow to Cloudflare Workers (user's account)
     * Requires user to have configured Cloudflare credentials
     */
    async deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
        this.logger().info('Starting Cloudflare deployment for workflow');
        
        // Update deployment status
        this.setState({
            ...this.state,
            deploymentStatus: 'deploying',
            deploymentError: null
        });
        
        try {
            // Get user Cloudflare credentials
            const credentials = await this.getCloudflareCredentials();
            
            if (!credentials) {
                const errorMsg = 'Cloudflare account credentials not configured. Please add them in Settings → Secrets.';
                this.logger().error(errorMsg);
                this.setState({
                    ...this.state,
                    deploymentStatus: 'failed',
                    deploymentError: errorMsg
                });
                throw new Error(errorMsg);
            }
            
            this.logger().info('Found Cloudflare credentials, deploying to user account', {
                accountId: credentials.accountId
            });
            
            // Deploy with user credentials
            const result = await this.deploymentManager.deployToCloudflare({
                userCredentials: credentials,
                onStarted: (data) => {
                    this.logger().info('Cloudflare deployment started', data);
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data);
                },
                onCompleted: (data) => {
                    this.logger().info('Cloudflare deployment completed', data);
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data);
                },
                onError: (data) => {
                    this.logger().error('Cloudflare deployment failed', data);
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data);
                },
                onPreviewExpired: () => {
                    this.logger().error('Preview expired during deployment');
                    this.broadcast(WebSocketMessageResponses.ERROR, {
                        error: 'Preview expired. Please redeploy the workflow.'
                    });
                }
            });
            
            if (!result || !result.deploymentUrl) {
                const errorMsg = 'Deployment failed - no URL returned';
                this.setState({
                    ...this.state,
                    deploymentStatus: 'failed',
                    deploymentError: errorMsg
                });
                return null;
            }
            
            // Update state with deployment info
            this.setState({
                ...this.state,
                deploymentUrl: result.deploymentUrl,
                deploymentStatus: 'deployed',
                deploymentError: null
            });
            
            this.logger().info('Workflow deployed successfully', {
                deploymentUrl: result.deploymentUrl,
                deploymentId: result.deploymentId
            });
            
            // Return format matching IBaseAgent interface
            return {
                deploymentUrl: result.deploymentUrl || undefined,
                workersUrl: result.deploymentUrl || undefined
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown deployment error';
            this.logger().error('Workflow deployment failed', { error: errorMsg });
            
            this.setState({
                ...this.state,
                deploymentStatus: 'failed',
                deploymentError: errorMsg
            });
            
            return null;
        }
    }
    
}
