import { BaseProjectContext } from './BaseProjectContext';
import { WorkflowGenState, WorkflowMetadata } from '../../core/state';
import { FileState } from '../../core/state';
import { TemplateDetails } from '../../../services/sandbox/sandboxTypes';

export class WorkflowContext extends BaseProjectContext {
    constructor(
        query: string,
        templateDetails: TemplateDetails,
        dependencies: Record<string, string>,
        allFiles: FileState[],
        commandsHistory: string[],
        public readonly workflowCode: string | null,
        public readonly workflowMetadata: WorkflowMetadata | null
    ) {
        super(query, templateDetails, dependencies, allFiles, commandsHistory);
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
            state.workflowCode,
            state.workflowMetadata
        );
    }
}
