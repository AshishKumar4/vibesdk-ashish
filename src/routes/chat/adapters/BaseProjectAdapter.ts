import type { IProjectAdapter } from './IProjectAdapter';
import type { ProjectType } from 'worker/agents/core/types';

/**
 * Base adapter with common capabilities for all project types
 * 
 * Provides abstract base for project-specific adapters.
 * Message handling is done in handle-websocket-message.ts, not here.
 */
export abstract class BaseProjectAdapter implements IProjectAdapter {
  abstract readonly projectType: ProjectType;
  abstract readonly canGenerateBlueprint: boolean;
  abstract readonly canHavePhases: boolean;
  abstract readonly canHaveMultipleFiles: boolean;

  abstract getPreviewComponent(): ReturnType<IProjectAdapter['getPreviewComponent']>;
  abstract getTimelineComponent(): ReturnType<IProjectAdapter['getTimelineComponent']>;
  abstract canDeploy(hasFiles: boolean): boolean;
}
