import type { BaseProjectAgent } from './baseProjectAgent';
import type { BaseProjectState } from './state';
import type { FileOutputType, FileConceptType } from '../schemas';
import type { StructuredLogger } from '../../logger';

export type PluginHookParams<TState extends BaseProjectState> = {
    onRegister: [agent: BaseProjectAgent<TState>, logger: StructuredLogger];
    onInitialize: [agent: BaseProjectAgent<TState>];
    beforeFilesGenerated: [agent: BaseProjectAgent<TState>, phaseName: string, files: FileConceptType[]];
    afterFilesGenerated: [agent: BaseProjectAgent<TState>, phaseName: string, files: FileOutputType[]];
    beforeDeployment: [agent: BaseProjectAgent<TState>];
    afterDeployment: [agent: BaseProjectAgent<TState>, previewUrl: string];
    onGenerationStart: [agent: BaseProjectAgent<TState>];
    onGenerationComplete: [agent: BaseProjectAgent<TState>];
    onError: [agent: BaseProjectAgent<TState>, error: Error, context: string];
    onStateUpdate: [agent: BaseProjectAgent<TState>, oldState: TState, newState: TState];
    onUnregister: [agent: BaseProjectAgent<TState>];
};

/**
 * Plugin interface for extending agent behavior through lifecycle hooks.
 */
export interface AgentPlugin<TState extends BaseProjectState = BaseProjectState> {
    readonly name: string;
    onRegister?(agent: BaseProjectAgent<TState>, logger: StructuredLogger): void | Promise<void>;
    onInitialize?(agent: BaseProjectAgent<TState>): void | Promise<void>;
    beforeFilesGenerated?(
        agent: BaseProjectAgent<TState>,
        phaseName: string,
        files: FileConceptType[]
    ): void | Promise<void>;
    afterFilesGenerated?(
        agent: BaseProjectAgent<TState>,
        phaseName: string,
        files: FileOutputType[]
    ): void | Promise<void>;
    beforeDeployment?(agent: BaseProjectAgent<TState>): void | Promise<void>;
    afterDeployment?(
        agent: BaseProjectAgent<TState>,
        previewUrl: string
    ): void | Promise<void>;
    onGenerationStart?(agent: BaseProjectAgent<TState>): void | Promise<void>;
    onGenerationComplete?(agent: BaseProjectAgent<TState>): void | Promise<void>;
    onError?(
        agent: BaseProjectAgent<TState>,
        error: Error,
        context: string
    ): void | Promise<void>;
    onStateUpdate?(
        agent: BaseProjectAgent<TState>,
        oldState: TState,
        newState: TState
    ): void | Promise<void>;
    onUnregister?(agent: BaseProjectAgent<TState>): void | Promise<void>;
}

export class PluginManager<TState extends BaseProjectState = BaseProjectState> {
    private plugins: Map<string, AgentPlugin<TState>> = new Map();
    private agent: BaseProjectAgent<TState>;
    private logger: StructuredLogger;
    
    constructor(agent: BaseProjectAgent<TState>, logger: StructuredLogger) {
        this.agent = agent;
        this.logger = logger;
    }
    async register(plugin: AgentPlugin<TState>): Promise<void> {
        if (this.plugins.has(plugin.name)) {
            this.logger.warn(`Plugin ${plugin.name} is already registered`);
            return;
        }
        
        this.plugins.set(plugin.name, plugin);
        
        try {
            await plugin.onRegister?.(this.agent, this.logger);
            this.logger.info(`Plugin registered: ${plugin.name}`);
        } catch (error) {
            this.logger.error(`Failed to register plugin ${plugin.name}`, error);
            this.plugins.delete(plugin.name);
            throw error;
        }
    }
    async unregister(pluginName: string): Promise<void> {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            this.logger.warn(`Plugin ${pluginName} is not registered`);
            return;
        }
        
        try {
            await plugin.onUnregister?.(this.agent);
            this.plugins.delete(pluginName);
            this.logger.info(`Plugin unregistered: ${pluginName}`);
        } catch (error) {
            this.logger.error(`Failed to unregister plugin ${pluginName}`, error);
            throw error;
        }
    }
    get(pluginName: string): AgentPlugin<TState> | undefined {
        return this.plugins.get(pluginName);
    }
    has(pluginName: string): boolean {
        return this.plugins.has(pluginName);
    }
    getAll(): AgentPlugin<TState>[] {
        return Array.from(this.plugins.values());
    }
    async executeHook<K extends keyof PluginHookParams<TState>>(
        hookName: K,
        ...args: PluginHookParams<TState>[K]
    ): Promise<void> {
        const errors: Array<{ plugin: string; error: Error }> = [];
        
        for (const plugin of this.plugins.values()) {
            const hook = plugin[hookName as keyof AgentPlugin<TState>];
            if (typeof hook === 'function') {
                try {
                    await (hook as Function).apply(plugin, args);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    errors.push({ plugin: plugin.name, error: err });
                    this.logger.error(`Plugin ${plugin.name} hook ${String(hookName)} failed`, err);
                }
            }
        }
        if (errors.length > 0) {
            const errorMsg = errors.map(e => `${e.plugin}: ${e.error.message}`).join('; ');
            this.logger.warn(`${errors.length} plugin(s) failed during ${String(hookName)}: ${errorMsg}`);
        }
    }
}