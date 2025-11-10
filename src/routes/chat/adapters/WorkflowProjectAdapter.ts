import type { ComponentType } from 'react';
import { BaseProjectAdapter } from './BaseProjectAdapter';
import type { PreviewComponentProps, TimelineComponentProps } from './IProjectAdapter';
import { WorkflowProjectSection } from '../components/workflow-project-section';

/**
 * Workflow Project Adapter - provides capabilities for Cloudflare Workflows generation
 * 
 * Workflows:
 * - No blueprint (generate directly from description)
 * - Single-phase generation (MVP - may support phases in future)
 * - Multiple files support
 * - Always deploy to user's Cloudflare account
 */
export class WorkflowProjectAdapter extends BaseProjectAdapter {
  readonly projectType = 'workflow' as const;
  readonly canGenerateBlueprint = false;
  readonly canHavePhases = false; // MVP: single generation
  readonly canHaveMultipleFiles = true;

  getPreviewComponent(): ComponentType<PreviewComponentProps> | null {
    // Workflows don't have traditional preview - deployment URL is shown in timeline
    return null;
  }

  getTimelineComponent(): ComponentType<TimelineComponentProps> {
    return WorkflowProjectSection as ComponentType<TimelineComponentProps>;
  }

  canDeploy(hasFiles: boolean): boolean {
    // Workflows can deploy once workflow files are generated
    return hasFiles;
  }
}
