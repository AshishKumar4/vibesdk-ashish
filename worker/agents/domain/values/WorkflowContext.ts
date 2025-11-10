import { BaseProjectContext } from './BaseProjectContext';
import { WorkflowGenState, WorkflowMetadata } from '../../core/state';
import { FileState } from '../../core/state';
import { TemplateDetails } from '../../../services/sandbox/sandboxTypes';

export class WorkflowContext extends BaseProjectContext {
    public readonly workflowMetadata: WorkflowMetadata | null;
    
    constructor(
        query: string,
        templateDetails: TemplateDetails,
        dependencies: Record<string, string>,
        allFiles: FileState[],
        commandsHistory: string[],
        workflowMetadata: WorkflowMetadata | null
    ) {
        super(query, templateDetails, dependencies, allFiles, commandsHistory);
        this.workflowMetadata = workflowMetadata;
    }
    
    /**
     * Get workflow code from allFiles (src/index.ts)
     * Computed property - no need to duplicate in state
     */
    get workflowCode(): string | null {
        const workflowFile = this.allFiles.find(f => f.filePath === 'src/index.ts');
        return workflowFile?.fileContents || null;
    }

    static from(
        state: WorkflowGenState,
        templateDetails: TemplateDetails,
        dependencies: Record<string, string>
    ): WorkflowContext {
        const allFiles = Object.values(state.generatedFilesMap);
        const commandsHistory = state.commandsHistory || [];

        return new WorkflowContext(
            state.query,
            templateDetails,
            dependencies,
            allFiles,
            commandsHistory,
            state.workflowMetadata
        );
    }
}
