import { Agent, AgentContext } from 'agents';
import { GitVersionControl } from '../git';
import { StructuredLogger, createObjectLogger } from '../../logger';
import { BaseProjectState } from './state';
import { FileManager } from '../services/implementations/FileManager';
import { StateManager } from '../services/implementations/StateManager';
import { DeploymentManager } from '../services/implementations/DeploymentManager';
import { TemplateDetails, PreviewType, StaticAnalysisResponse, RuntimeError, ExecuteCommandsResponse, GitHubPushRequest } from '../../services/sandbox/sandboxTypes';
import { FileOutputType, FileConceptType } from '../schemas';
import { BaseSandboxService } from '../../services/sandbox/BaseSandboxService';
import { broadcastToConnections } from './websocket';
import { WebSocketMessageResponses } from '../constants';
import { WebSocketMessageType, WebSocketMessageData } from '../../api/websocketTypes';
import { AppService } from '../../database';
import { ProcessedImageAttachment } from '../../types/image-attachment';
import { AgentSummary, DeepDebugResult } from './types';
import { RenderToolCall } from '../operations/UserConversationProcessor';
import { PREVIEW_EXPIRED_ERROR } from '../constants';
import { DeepCodeDebugger } from '../assistants/codeDebugger';
import { BaseOperationOptions } from '../operations/common';
import { updatePackageJson } from '../utils/packageSyncer';
import { CodingAgentInterface } from '../services/implementations/CodingAgent';
import { AppBuilderAgentInterface } from '../services/implementations/AppBuilderAgentInterface';
import { validateAndCleanBootstrapCommands } from '../utils/common';
import { ConversationMessage, ConversationState } from '../inferutils/common';
import { InferenceContext } from '../inferutils/config.types';
import { IBaseAgent } from '../services/interfaces/IBaseAgent';
import { GitHubExportResult, GitHubService } from 'worker/services/github';
import { UserSecretsService } from 'worker/services/secrets/UserSecretsService';

const DEFAULT_CONVERSATION_SESSION_ID = 'default';
/**
 * BaseProjectAgent - Common infrastructure for all project types
 * Implements IBaseAgent with universal methods only
 */
export abstract class BaseProjectAgent<TState extends BaseProjectState> 
    extends Agent<Env, TState> implements IBaseAgent {
    
    // === Static Configuration ===
    protected static readonly MAX_COMMANDS_HISTORY = 10;
    
    // === Shared Core Infrastructure ===
    
    protected git: GitVersionControl;
    protected stateManager!: StateManager<TState>;
    protected fileManager!: FileManager;
    protected deploymentManager!: DeploymentManager;
    // Note: codingAgent is NOT initialized here - subclasses initialize their specific interface type
    // - SimpleCodeGeneratorAgent: AppBuilderAgentInterface
    // - SimpleWorkflowGeneratorAgent: CodingAgentInterface
    
    public _logger: StructuredLogger | undefined;
    
    // In-memory caches (ephemeral, lost on DO eviction)
    protected generationPromise: Promise<void> | null = null;
    protected currentAbortController?: AbortController;
    protected deepDebugPromise: Promise<{ transcript: string } | { error: string }> | null = null;
    protected deepDebugConversationId: string | null = null;
    protected githubTokenCache: {
        token: string;
        username: string;
        expiresAt: number;
    } | null = null;
    // In-memory storage for user-uploaded images (not persisted in DO state)
    protected pendingUserImages: ProcessedImageAttachment[] = []
    protected previewUrlCache: string = '';
    
    constructor(ctx: AgentContext, env: Env) {
        super(ctx, env);
        
        // Initialize SQL tables for conversations
        this.sql`CREATE TABLE IF NOT EXISTS full_conversations (id TEXT PRIMARY KEY, messages TEXT)`;
        this.sql`CREATE TABLE IF NOT EXISTS compact_conversations (id TEXT PRIMARY KEY, messages TEXT)`;
        
        // Initialize Git (bind sql to preserve 'this' context)
        this.git = new GitVersionControl(this.sql.bind(this));
        
        // Initialize core managers
        this.initializeManagers();
    }
    
    async getFullState(): Promise<TState> {
        return this.state;
    }
    
    getPreviewUrlCache() {
        return this.previewUrlCache;
    }
    
    /**
     * Initialize shared managers
     */
    protected initializeManagers(): void {
        // Initialize StateManage
        this.stateManager = new StateManager<TState>(
            () => this.state,
            (s) => this.setState(s)
        );
        
        // Initialize FileManager
        this.fileManager = new FileManager(
            this.stateManager,
            () => this.getTemplateDetails()!,
            this.git
        );
        
        // Initialize DeploymentManager
        this.deploymentManager = new DeploymentManager(
            {
                stateManager: this.stateManager,
                fileManager: this.fileManager,
                getLogger: () => this.logger(),
                env: this.env
            },
            BaseProjectAgent.MAX_COMMANDS_HISTORY
        );
    }

    /*
    * Each DO has 10 gb of sqlite storage. However, the way agents sdk works, it stores the 'state' object of the agent as a single row
    * in the cf_agents_state table. And row size has a much smaller limit in sqlite. Thus, we only keep current compactified conversation
    * in the agent's core state and store the full conversation in a separate DO table.
    */
    getConversationState(id: string = DEFAULT_CONVERSATION_SESSION_ID): ConversationState {
        const currentConversation = this.state.conversationMessages;
        const rows = this.sql<{ messages: string, id: string }>`SELECT * FROM full_conversations WHERE id = ${id}`;
        let fullHistory: ConversationMessage[] = [];
        if (rows.length > 0 && rows[0].messages) {
            try {
                const parsed = JSON.parse(rows[0].messages);
                if (Array.isArray(parsed)) {
                    fullHistory = parsed as ConversationMessage[];
                }
            } catch (_e) {}
        }
        if (fullHistory.length === 0) {
            fullHistory = currentConversation;
        }
        // Load compact (running) history from sqlite with fallback to in-memory state for migration
        const compactRows = this.sql<{ messages: string, id: string }>`SELECT * FROM compact_conversations WHERE id = ${id}`;
        let runningHistory: ConversationMessage[] = [];
        if (compactRows.length > 0 && compactRows[0].messages) {
            try {
                const parsed = JSON.parse(compactRows[0].messages);
                if (Array.isArray(parsed)) {
                    runningHistory = parsed as ConversationMessage[];
                }
            } catch (_e) {}
        }
        if (runningHistory.length === 0) {
            runningHistory = currentConversation;
        }

        // Remove duplicates
        const deduplicateMessages = (messages: ConversationMessage[]): ConversationMessage[] => {
            const seen = new Set<string>();
            return messages.filter(msg => {
                if (seen.has(msg.conversationId)) {
                    return false;
                }
                seen.add(msg.conversationId);
                return true;
            });
        };

        runningHistory = deduplicateMessages(runningHistory);
        fullHistory = deduplicateMessages(fullHistory);
        
        return {
            id: id,
            runningHistory,
            fullHistory,
        };
    }

    setConversationState(conversations: ConversationState) {
        const serializedFull = JSON.stringify(conversations.fullHistory);
        const serializedCompact = JSON.stringify(conversations.runningHistory);
        try {
            this.logger().info(`Saving conversation state ${conversations.id}, full_length: ${serializedFull.length}, compact_length: ${serializedCompact.length}`);
            this.sql`INSERT OR REPLACE INTO compact_conversations (id, messages) VALUES (${conversations.id}, ${serializedCompact})`;
            this.sql`INSERT OR REPLACE INTO full_conversations (id, messages) VALUES (${conversations.id}, ${serializedFull})`;
        } catch (error) {
            this.logger().error(`Failed to save conversation state ${conversations.id}`, error);
        }
    }

    addConversationMessage(message: ConversationMessage) {
        const conversationState = this.getConversationState();
        if (!conversationState.runningHistory.find(msg => msg.conversationId === message.conversationId)) {
            conversationState.runningHistory.push(message);
        } else  {
            conversationState.runningHistory = conversationState.runningHistory.map(msg => {
                if (msg.conversationId === message.conversationId) {
                    return message;
                }
                return msg;
            });
        }
        if (!conversationState.fullHistory.find(msg => msg.conversationId === message.conversationId)) {
            conversationState.fullHistory.push(message);
        } else {
            conversationState.fullHistory = conversationState.fullHistory.map(msg => {
                if (msg.conversationId === message.conversationId) {
                    return message;
                }
                return msg;
            });
        }
        this.setConversationState(conversationState);
    }
    
    getSummary(): Promise<AgentSummary> {
        const summaryData = {
            query: this.state.query,
            generatedCode: this.fileManager.getGeneratedFiles(),
            conversation: this.state.conversationMessages,
        };
        return Promise.resolve(summaryData);
    }

    // === Abstract Methods (must implement in subclasses) ===
    
    /**
     * Get user's Cloudflare credentials for workflow deployment
     * Returns null if not configured
     */
    protected async getCloudflareCredentials(): Promise<{
        accountId: string;
        apiToken: string;
    } | null> {
        try {
            const secretsService = new UserSecretsService(this.env);
            return await secretsService.getCloudflareCredentials(
                this.state.inferenceContext.userId
            );
        } catch (error) {
            this.logger().warn('Failed to get Cloudflare credentials', { error });
            return null;
        }
    }

    // ==========================================
    // ABSTRACT METHODS
    // ==========================================
    
    /**
     * Returns the project type for logging and routing
     */
    abstract getProjectType(): 'app' | 'workflow';
    
    /**
     * Get template details for FileManager
     * App agent caches this, workflow agent may return a synthesized template
     */
    abstract getTemplateDetails(): TemplateDetails | null;

    abstract ensureTemplateDetails(): Promise<TemplateDetails>;
    
    // === Shared Logger ===
    
    protected initLogger(agentId: string, sessionId: string, userId: string): StructuredLogger {
        const projectType = this.getProjectType();
        const loggerName = projectType === 'app' ? 'CodeGeneratorAgent' : 'WorkflowGeneratorAgent';
        
        this._logger = createObjectLogger(this, loggerName);
        this._logger.setObjectId(agentId);
        this._logger.setFields({ sessionId, agentId, userId });
        return this._logger;
    }
    
    logger(): StructuredLogger {
        if (!this._logger) {
            this._logger = this.initLogger(
                this.getAgentId(), 
                this.state.sessionId, 
                this.state.inferenceContext.userId
            );
        }
        return this._logger;
    }
    
    getAgentId(): string {
        return this.state.inferenceContext.agentId;
    }

    getSessionId() {
        return this.deploymentManager.getSessionId();
    }

    getFileGenerated(filePath: string) {
        return this.fileManager!.getGeneratedFile(filePath) || null;
    }

    /**
     * Gets inference context with abort signal
     * Reuses existing abort controller for nested operations
     */
    protected getInferenceContext(): InferenceContext {
        const controller = this.getOrCreateAbortController();
        
        return {
            ...this.state.inferenceContext,
            abortSignal: controller.signal,
        };
    }

    // === WebSocket Broadcast Helper ===
    
    public broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void {
        broadcastToConnections(this, msg, data || {} as WebSocketMessageData<T>);
    }

    protected broadcastError(context: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger().error(`${context}:`, error);
        this.broadcast(WebSocketMessageResponses.ERROR, {
            error: `${context}: ${errorMessage}`
        });
    }

    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }
    
    // === Shared Git Operations ===
    
    /**
     * Initialize git and create initial commit if needed
     */
    async gitInit(): Promise<void> {
        try {
            await this.git.init();
            this.logger().info("Git initialized successfully");
            // Check if there is any commit
            const head = await this.git.getHead();
            
            if (!head) {
                this.logger().info("No commits found, creating initial commit");
                // get all generated files and commit them
                const generatedFiles = this.fileManager.getGeneratedFiles();
                if (generatedFiles.length === 0) {
                    this.logger().info("No generated files found, skipping initial commit");
                    return;
                }
                await this.git.commit(generatedFiles, "Initial commit");
                this.logger().info("Initial commit created successfully");
            }
        } catch (error) {
            this.logger().error("Error during git init:", error);
        }
    }
    
    /**
     * Export git objects
     * The route handler will build the repo with template rebasing
     */
    async exportGitObjects(): Promise<{
        gitObjects: Array<{ path: string; data: Uint8Array }>;
        query: string;
        hasCommits: boolean;
        templateDetails: TemplateDetails | null;
    }> {
        try {
            // Export git objects efficiently (minimal DO memory usage)
            const gitObjects = this.git.fs.exportGitObjects();

            await this.gitInit();
            
            // Ensure template details are available
            await this.ensureTemplateDetails();
            
            return {
                gitObjects,
                query: this.state.query || 'N/A',
                hasCommits: gitObjects.length > 0,
                templateDetails: this.getTemplateDetails()
            };
        } catch (error) {
            this.logger().error('exportGitObjects failed', error);
            throw error;
        }
    }

    // === GitHub Operations ===

    /**
     * Cache GitHub OAuth token in memory for subsequent exports
     * Token is ephemeral - lost on DO eviction
     */
    setGitHubToken(token: string, username: string, ttl: number = 3600000): void {
        this.githubTokenCache = {
            token,
            username,
            expiresAt: Date.now() + ttl
        };
        this.logger().info('GitHub token cached', { 
            username, 
            expiresAt: new Date(this.githubTokenCache.expiresAt).toISOString() 
        });
    }

    /**
     * Get cached GitHub token if available and not expired
     */
    getGitHubToken(): { token: string; username: string } | null {
        if (!this.githubTokenCache) {
            return null;
        }
        
        if (Date.now() >= this.githubTokenCache.expiresAt) {
            this.logger().info('GitHub token expired, clearing cache');
            this.githubTokenCache = null;
            return null;
        }
        
        return {
            token: this.githubTokenCache.token,
            username: this.githubTokenCache.username
        };
    }

    /**
     * Clear cached GitHub token
     */
    clearGitHubToken(): void {
        this.githubTokenCache = null;
        this.logger().info('GitHub token cleared');
    }

    /**
     * Export generated code to a GitHub repository
     */
    async pushToGitHub(options: GitHubPushRequest): Promise<GitHubExportResult> {
        try {
            this.logger().info('Starting GitHub export using DO git');

            // Broadcast export started
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_STARTED, {
                message: `Starting GitHub export to repository "${options.cloneUrl}"`,
                repositoryName: options.repositoryHtmlUrl,
                isPrivate: options.isPrivate
            });

            // Export git objects from DO
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
                message: 'Preparing git repository...',
                step: 'preparing',
                progress: 20
            });

            const { gitObjects, query, templateDetails } = await this.exportGitObjects();
            
            this.logger().info('Git objects exported', {
                objectCount: gitObjects.length,
                hasTemplate: !!templateDetails
            });

            // Get app createdAt timestamp for template base commit
            let appCreatedAt: Date | undefined = undefined;
            try {
                const appId = this.getAgentId();
                if (appId) {
                    const appService = new AppService(this.env);
                    const app = await appService.getAppDetails(appId);
                    if (app && app.createdAt) {
                        appCreatedAt = new Date(app.createdAt);
                        this.logger().info('Using app createdAt for template base', {
                            createdAt: appCreatedAt.toISOString()
                        });
                    }
                }
            } catch (error) {
                this.logger().warn('Failed to get app createdAt, using current time', { error });
                appCreatedAt = new Date(); // Fallback to current time
            }

            // Push to GitHub using new service
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
                message: 'Uploading to GitHub repository...',
                step: 'uploading_files',
                progress: 40
            });

            const result = await GitHubService.exportToGitHub({
                gitObjects,
                templateDetails,
                appQuery: query,
                appCreatedAt,
                token: options.token,
                repositoryUrl: options.repositoryHtmlUrl,
                username: options.username,
                email: options.email
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to export to GitHub');
            }

            this.logger().info('GitHub export completed', { 
                commitSha: result.commitSha
            });

            // Cache token for subsequent exports
            if (options.token && options.username) {
                try {
                    this.setGitHubToken(options.token, options.username);
                    this.logger().info('GitHub token cached after successful export');
                } catch (cacheError) {
                    // Non-fatal - continue with finalization
                    this.logger().warn('Failed to cache GitHub token', { error: cacheError });
                }
            }

            // Update database
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
                message: 'Finalizing GitHub export...',
                step: 'finalizing',
                progress: 90
            });

            const agentId = this.getAgentId();
            this.logger().info('[DB Update] Updating app with GitHub repository URL', {
                agentId,
                repositoryUrl: options.repositoryHtmlUrl,
                visibility: options.isPrivate ? 'private' : 'public'
            });

            const appService = new AppService(this.env);
            const updateResult = await appService.updateGitHubRepository(
                agentId || '',
                options.repositoryHtmlUrl || '',
                options.isPrivate ? 'private' : 'public'
            );

            this.logger().info('[DB Update] Database update result', {
                agentId,
                success: updateResult,
                repositoryUrl: options.repositoryHtmlUrl
            });

            // Broadcast success
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_COMPLETED, {
                message: `Successfully exported to GitHub repository: ${options.repositoryHtmlUrl}`,
                repositoryUrl: options.repositoryHtmlUrl,
                cloneUrl: options.cloneUrl,
                commitSha: result.commitSha
            });

            this.logger().info('GitHub export completed successfully', { 
                repositoryUrl: options.repositoryHtmlUrl,
                commitSha: result.commitSha
            });
            
            return { 
                success: true, 
                repositoryUrl: options.repositoryHtmlUrl,
                cloneUrl: options.cloneUrl
            };

        } catch (error) {
            this.logger().error('GitHub export failed', error);
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_ERROR, {
                message: `GitHub export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return { 
                success: false, 
                repositoryUrl: options.repositoryHtmlUrl,
                cloneUrl: options.cloneUrl 
            };
        }
    }
    // === Deep Debugging Operations ===

    isDeepDebugging(): boolean {
        return this.deepDebugPromise !== null;
    }
    
    async waitForDeepDebug(): Promise<void> {
        if (this.deepDebugPromise) {
            await this.deepDebugPromise;
        }
    }
    
    getDeepDebugSessionState(): { conversationId: string } | null {
        if (this.deepDebugConversationId && this.deepDebugPromise) {
            return { conversationId: this.deepDebugConversationId };
        }
        return null;
    }

    protected getOrCreateAbortController(): AbortController {
        // Don't reuse aborted controllers
        if (this.currentAbortController && !this.currentAbortController.signal.aborted) {
            return this.currentAbortController;
        }
        
        // Create new controller in memory for new operation
        this.currentAbortController = new AbortController();
        
        return this.currentAbortController;
    }
    
    protected clearAbortController(): void {
        this.currentAbortController = undefined;
    }
    
    public cancelCurrentInference(): boolean {
        if (this.currentAbortController) {
            this.logger().info('Cancelling current inference operation');
            this.currentAbortController.abort();
            this.currentAbortController = undefined;
            return true;
        }
        return false;
    }

    abstract generateReadme(): Promise<void>;

    // === ICodingAgent Implementation ===
    
    getSandboxServiceClient(): BaseSandboxService {
        return this.deploymentManager.getClient();
    }
    
    getGit(): GitVersionControl {
        return this.git;
    }
    
    isCodeGenerating(): boolean {
        return this.generationPromise !== null;
    }
    
    async waitForGeneration(): Promise<void> {
        if (this.generationPromise) {
            try {
                await this.generationPromise;
                this.logger().info("Code generation completed successfully");
            } catch (error) {
                this.logger().error("Error during code generation:", error);
            }
        } else {
            this.logger().error("No generation process found");
        }
    }
    
    /**
     * Sync package.json from sandbox to agent's git repository
     * Called after install/add/remove commands to keep dependencies in sync
     */
    private async syncPackageJsonFromSandbox(): Promise<void> {
        try {
            this.logger().info('Fetching current package.json from sandbox');
            const results = await this.readFiles(['package.json']);
            if (!results || !results.files || results.files.length === 0) {
                this.logger().warn('Failed to fetch package.json from sandbox', { results });
                return;
            }
            const packageJsonContent = results.files[0].content;

            const { updated, packageJson } = updatePackageJson(this.state.lastPackageJson, packageJsonContent);
            if (!updated) {
                this.logger().info('package.json has not changed, skipping sync');
                return;
            }
            // Update state with latest package.json
            this.setState({
                ...this.state,
                lastPackageJson: packageJson
            });
            
            // Commit to git repository
            const fileState = await this.fileManager.saveGeneratedFile(
                {
                    filePath: 'package.json',
                    fileContents: packageJson,
                    filePurpose: 'Project dependencies and configuration'
                },
                'chore: sync package.json dependencies from sandbox'
            );
            
            this.logger().info('Successfully synced package.json to git', { 
                filePath: fileState.filePath,
            });
            
            // Broadcast update to clients
            this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                message: 'Synced package.json from sandbox',
                file: fileState
            });
            
        } catch (error) {
            this.logger().error('Failed to sync package.json from sandbox', error);
            // Non-critical error - don't throw, just log
        }
    }

    async deployToSandbox(files: FileOutputType[] = [], redeploy: boolean = false, commitMessage?: string, clearLogs: boolean = false): Promise<PreviewType | null> {
        // Call deployment manager with callbacks for broadcasting at the right times
        const result = await this.deploymentManager.deployToSandbox(
            files,
            redeploy,
            commitMessage,
            clearLogs,
            {
                onStarted: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, data);
                },
                onCompleted: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, data);
                },
                onError: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, data);
                },
                onAfterSetupCommands: async () => {
                    // Sync package.json after setup commands (includes dependency installs)
                    await this.syncPackageJsonFromSandbox();
                }
            }
        );

        return result;
    }
    
    async getLogs(_reset?: boolean, durationSeconds?: number): Promise<string> {
        if (!this.state.sandboxInstanceId) {
            throw new Error('Cannot get logs: No sandbox instance available');
        }
        
        const response = await this.getSandboxServiceClient().getLogs(this.state.sandboxInstanceId, _reset, durationSeconds);
        if (response.success) {
            return `STDOUT: ${response.logs.stdout}\nSTDERR: ${response.logs.stderr}`;
        } else {
            return `Failed to get logs, ${response.error}`;
        }
    }
    
    async fetchRuntimeErrors(clear: boolean = true): Promise<RuntimeError[]> {
        await this.deploymentManager.waitForPreview();

        try {
            const errors = await this.deploymentManager.fetchRuntimeErrors(clear);
            
            if (errors.length > 0) {
                this.broadcast(WebSocketMessageResponses.RUNTIME_ERROR_FOUND, {
                    errors,
                    message: "Runtime errors found",
                    count: errors.length
                });
            }

            return errors;
        } catch (error) {
            this.logger().error("Exception fetching runtime errors:", error);
            // If fetch fails, initiate redeploy
            this.deployToSandbox();
            return [];
        }
    }
    
    async runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse> {
        try {
            const analysisResponse = await this.deploymentManager.runStaticAnalysis(files);

            const { lint, typecheck } = analysisResponse;
            this.broadcast(WebSocketMessageResponses.STATIC_ANALYSIS_RESULTS, {
                lint: { issues: lint.issues, summary: lint.summary },
                typecheck: { issues: typecheck.issues, summary: typecheck.summary }
            });

            return analysisResponse;
        } catch (error) {
            this.broadcastError("Failed to lint code", error);
            return { success: false, lint: { issues: [], }, typecheck: { issues: [], } };
        }
    }
    
    async readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }> {
        const { sandboxInstanceId } = this.state;
        if (!sandboxInstanceId) {
            return { files: [] };
        }
        const resp = await this.getSandboxServiceClient().getFiles(sandboxInstanceId, paths);
        if (!resp.success) {
            this.logger().warn('readFiles failed', { error: resp.error });
            return { files: [] };
        }
        return { files: resp.files.map(f => ({ path: f.filePath, content: f.fileContents })) };
    }
    
    async execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse> {
        const { sandboxInstanceId } = this.state;
        if (!sandboxInstanceId) {
            return { success: false, results: [], error: 'No sandbox instance' } as any;
        }
        const result = await this.getSandboxServiceClient().executeCommands(sandboxInstanceId, commands, timeout);
        if (shouldSave) {
            this.saveExecutedCommands(commands);
        }
        return result;
    }

    /**
     * Delete files from the file manager
     */
    async deleteFiles(filePaths: string[]) {
        const deleteCommands: string[] = [];
        for (const filePath of filePaths) {
            deleteCommands.push(`rm -rf ${filePath}`);
        }
        // Remove the files from file manager
        this.fileManager.deleteFiles(filePaths);
        try {
            await this.execCommands(deleteCommands, true);
            this.logger().info(`Deleted ${filePaths.length} files: ${filePaths.join(", ")}`);
        } catch (error) {
            this.logger().error('Error deleting files:', error);
        }
    }

    protected getBootstrapCommands() {
        const bootstrapCommands = this.state.commandsHistory || [];
        // Validate, deduplicate, and clean
        const { validCommands } = validateAndCleanBootstrapCommands(bootstrapCommands);
        return validCommands;
    }

    protected async saveExecutedCommands(commands: string[]): Promise<void> {
        this.logger().info('Saving executed commands', { commands });
        
        // Merge with existing history
        const mergedCommands = [...(this.state.commandsHistory || []), ...commands];
        
        // Validate, deduplicate, and clean
        const { validCommands, invalidCommands, deduplicated } = validateAndCleanBootstrapCommands(mergedCommands);

        // Log what was filtered out
        if (invalidCommands.length > 0 || deduplicated > 0) {
            this.logger().warn('[commands] Bootstrap commands cleaned', { 
                invalidCommands,
                invalidCount: invalidCommands.length,
                deduplicatedCount: deduplicated,
                finalCount: validCommands.length
            });
        }

        // Update state with cleaned commands
        this.setState({
            ...this.state,
            commandsHistory: validCommands
        });

        this.onExecutedCommandsHook(validCommands);

        // Sync package.json if any dependency-modifying commands were executed
        const hasDependencyCommands = commands.some(cmd => 
            cmd.includes('install') || 
            cmd.includes(' add ') || 
            cmd.includes('remove') ||
            cmd.includes('uninstall')
        );
        
        if (hasDependencyCommands) {
            this.logger().info('Dependency commands executed, syncing package.json from sandbox');
            await this.syncPackageJsonFromSandbox();
        }
    }

    abstract onExecutedCommandsHook(commands: string[]): void;
    
    async updateProjectName(newName: string): Promise<boolean> {
        try {
            const valid = /^[a-z0-9-_]{3,50}$/.test(newName);
            if (!valid) return false;
            
            // Update state
            this.setState({
                ...this.state,
                projectName: newName
            });
            
            // Update sandbox if exists
            let ok = true;
            if (this.state.sandboxInstanceId) {
                try {
                    ok = await this.getSandboxServiceClient().updateProjectName(this.state.sandboxInstanceId, newName);
                } catch (_) {
                    ok = false;
                }
            }
            
            // Update database
            try {
                const appService = new AppService(this.env);
                const dbOk = await appService.updateApp(this.getAgentId(), { title: newName });
                ok = ok && dbOk;
            } catch (error) {
                this.logger().error('Error updating project name in database:', error);
                ok = false;
            }
            
            this.broadcast(WebSocketMessageResponses.PROJECT_NAME_UPDATED, {
                message: 'Project name updated',
                projectName: newName
            });
            
            return ok;
        } catch (error) {
            this.logger().error('Error in updateProjectName:', error);
            return false;
        }
    }
    
    /**
     * Clear conversation history
     */
    clearConversation(): void {
        const messageCount = this.state.conversationMessages.length;
                        
        // Clear conversation messages only from agent's running history
        this.setState({
            ...this.state,
            conversationMessages: []
        });
                        
        // Send confirmation response
        this.broadcast(WebSocketMessageResponses.CONVERSATION_CLEARED, {
            message: 'Conversation history cleared',
            clearedMessageCount: messageCount
        });
    }
    
    /**
     * Queue user request when agent is busy
     */
    async queueUserRequest(request: string, images?: ProcessedImageAttachment[]): Promise<void> {
        this.setState({
            ...this.state,
            pendingUserInputs: [...this.state.pendingUserInputs, request]
        });
        if (images && images.length > 0) {
            this.logger().info('Storing user images in-memory for phase generation', {
                imageCount: images.length,
            });
            this.pendingUserImages = [...this.pendingUserImages, ...images];
        }
    }
    

    protected fetchPendingUserRequests(): string[] {
        const inputs = this.state.pendingUserInputs;
        if (inputs.length > 0) {
            this.setState({
                ...this.state,
                pendingUserInputs: []
            });
        }
        return inputs;
    }

    /**
     * Deploy to Cloudflare
     */
    async deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
        try {
            // Ensure sandbox instance exists first
            if (!this.state.sandboxInstanceId) {
                this.logger().info('No sandbox instance, deploying to sandbox first');
                await this.deployToSandbox();
                
                if (!this.state.sandboxInstanceId) {
                    this.logger().error('Failed to deploy to sandbox service');
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                        message: 'Deployment failed: Failed to deploy to sandbox service',
                        error: 'Sandbox service unavailable'
                    });
                    return null;
                }
            }

            // Call service - handles orchestration, callbacks for broadcasting
            const result = await this.deploymentManager.deployToCloudflare({
                onStarted: (data) => {
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data);
                },
                onCompleted: (data) => {
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data);
                },
                onError: (data) => {
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data);
                },
                onPreviewExpired: () => {
                    // Re-deploy sandbox and broadcast error
                    this.deployToSandbox();
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                        message: PREVIEW_EXPIRED_ERROR,
                        error: PREVIEW_EXPIRED_ERROR
                    });
                }
            });

            // Update database with deployment ID if successful
            if (result.deploymentUrl && result.deploymentId) {
                const appService = new AppService(this.env);
                await appService.updateDeploymentId(
                    this.getAgentId(),
                    result.deploymentId
                );
            }

            return result.deploymentUrl ? { deploymentUrl: result.deploymentUrl } : null;

        } catch (error) {
            this.logger().error('Cloudflare deployment error:', error);
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                message: 'Deployment failed',
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }
    
    /**
     * Generate files using phase implementation
     * Both agents can generate files, but implementation differs
     */
    abstract generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }>;
    
    /**
     * Execute deep debugging
     */
    async executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult> {
        const debugPromise = (async () => {
            try {
                const previousTranscript = this.state.lastDeepDebugTranscript ?? undefined;
                const operationOptions = this.getOperationOptions();
                const filesIndex = operationOptions.context.allFiles
                    .filter((f) =>
                        !focusPaths?.length ||
                        focusPaths.some((p) => f.filePath.includes(p)),
                    );

                const runtimeErrors = await this.fetchRuntimeErrors(true);

                const dbg = new DeepCodeDebugger(
                    operationOptions.env,
                    operationOptions.inferenceContext,
                );

                const out = await dbg.run(
                    { issue, previousTranscript },
                    { filesIndex, agent: this.getAgentInterface(), runtimeErrors },
                    streamCb,
                    toolRenderer,
                );

                // Save transcript for next session
                this.setState({
                    ...this.state,
                    lastDeepDebugTranscript: out,
                });

                return { success: true as const, transcript: out };
            } catch (e) {
                this.logger().error('Deep debugger failed', e);
                return { success: false as const, error: `Deep debugger failed: ${String(e)}` };
            } finally{
                this.deepDebugPromise = null;
                this.deepDebugConversationId = null;
            }
        })();

        // Store promise before awaiting
        this.deepDebugPromise = debugPromise;

        return await debugPromise;
    }
    
    /**
     * Get operation options for all operations
     */
    abstract getOperationOptions(): BaseOperationOptions 

    /**
     * Get agent interface for operations
     * Hook for subclasses to return their specific wrapper
     * - App: AppBuilderAgentInterface
     * - Workflow: CodingAgentInterface
     */
    abstract getAgentInterface(): AppBuilderAgentInterface | CodingAgentInterface;
}
