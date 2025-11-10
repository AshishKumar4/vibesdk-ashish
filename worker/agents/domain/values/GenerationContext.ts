import { Blueprint } from '../../schemas';
import { TemplateDetails } from '../../../services/sandbox/sandboxTypes';
import { CodeGenState, FileState, PhaseState } from '../../core/state';
import { DependencyManagement } from '../pure/DependencyManagement';
import type { StructuredLogger } from '../../../logger';
import { FileProcessing } from '../pure/FileProcessing';
import { BaseProjectContext } from './BaseProjectContext';

/**
 * PhasicGenerationContext - App-specific context extending base
 * 
 * Adds app-specific fields:
 * - blueprint: Project blueprint (apps only)
 * - generatedPhases: Phase-based generation (apps only)
 */
export class PhasicGenerationContext extends BaseProjectContext {
    constructor(
        query: string,
        templateDetails: TemplateDetails,
        dependencies: Record<string, string>,
        allFiles: FileState[],
        commandsHistory: string[],
        // App-specific fields
        public readonly blueprint: Blueprint,
        public readonly generatedPhases: PhaseState[]
    ) {
        super(query, templateDetails, dependencies, allFiles, commandsHistory);
    }

    /**
     * Create context from current state
     */
    static from(state: CodeGenState, templateDetails: TemplateDetails, logger?: Pick<StructuredLogger, 'info' | 'warn'>): PhasicGenerationContext {
        const dependencies = DependencyManagement.mergeDependencies(
            templateDetails.deps || {},
            state.lastPackageJson,
            logger
        );

        const allFiles = FileProcessing.getAllRelevantFiles(
            templateDetails,
            state.generatedFilesMap
        );

        return new PhasicGenerationContext(
            state.query,
            templateDetails,
            dependencies,
            allFiles,
            state.commandsHistory || [],
            state.blueprint,
            state.generatedPhases
        );
    }

    /**
     * Get formatted phases for prompt generation
     */
    getCompletedPhases() {
        return Object.values(this.generatedPhases.filter(phase => phase.completed));
    }
}