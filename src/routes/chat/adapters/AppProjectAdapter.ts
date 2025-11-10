import type { ComponentType } from 'react';
import { BaseProjectAdapter } from './BaseProjectAdapter';
import type { PreviewComponentProps, TimelineComponentProps } from './IProjectAdapter';
import { AppProjectSection } from '../components/app-project-section';

/**
 * App Project Adapter - provides capabilities for traditional app generation
 * 
 * Apps support:
 * - Blueprint generation
 * - Multi-phase generation
 * - Multiple files
 * - Both platform and self-hosted deployment
 */
export class AppProjectAdapter extends BaseProjectAdapter {
  readonly projectType = 'app' as const;
  readonly canGenerateBlueprint = true;
  readonly canHavePhases = true;
  readonly canHaveMultipleFiles = true;

  getPreviewComponent(): ComponentType<PreviewComponentProps> | null {
    // Apps use the iframe preview, handled by chat.tsx
    return null;
  }

  getTimelineComponent(): ComponentType<TimelineComponentProps> {
    return AppProjectSection as ComponentType<TimelineComponentProps>;
  }

  canDeploy(hasFiles: boolean): boolean {
    // Apps can deploy once first phase is complete (has files)
    return hasFiles;
  }
}
