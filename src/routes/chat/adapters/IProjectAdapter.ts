import type { ComponentType } from 'react';
import type { ProjectType } from 'worker/agents/core/types';

/**
 * Preview component props
 */
export interface PreviewComponentProps {
  files: Array<{
    filePath: string;
    fileContents: string;
    explanation?: string;
    isGenerating?: boolean;
    language?: string;
  }>;
  previewUrl?: string;
  activeFilePath?: string;
  onFileClick?: (filePath: string) => void;
  isGenerating: boolean;
}

/**
 * Timeline component props
 */
export interface TimelineComponentProps {
  isGenerating: boolean;
  files: PreviewComponentProps['files'];
}

/**
 * Interface for project type adapters
 * Each project type (app, workflow, etc.) implements this interface
 * to provide type-specific capabilities and UI components
 * 
 * Note: Message handling is done in handle-websocket-message.ts with projectType checks.
 * Adapters only provide capabilities, not state management.
 */
export interface IProjectAdapter {
  // Project capabilities
  readonly projectType: ProjectType;
  readonly canGenerateBlueprint: boolean;
  readonly canHavePhases: boolean;
  readonly canHaveMultipleFiles: boolean;

  // UI Components (can return null/undefined if not applicable)
  getPreviewComponent(): ComponentType<PreviewComponentProps> | null | undefined;
  getTimelineComponent(): ComponentType<TimelineComponentProps> | null | undefined;

  // Deployment readiness (simple check based on files)
  canDeploy(hasFiles: boolean): boolean;
}
