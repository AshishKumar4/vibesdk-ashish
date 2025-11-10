export * from './IProjectAdapter';
export * from './BaseProjectAdapter';
export * from './AppProjectAdapter';
export * from './WorkflowProjectAdapter';
export { requiresCloudflareAuth } from './DeploymentStrategy';

import type { ProjectType } from '@/api-types';
import { AppProjectAdapter } from './AppProjectAdapter';
import { WorkflowProjectAdapter } from './WorkflowProjectAdapter';
import type { IProjectAdapter } from './IProjectAdapter';

/**
 * Factory function to create appropriate adapter based on project type
 */
export function createProjectAdapter(
  projectType: ProjectType
): IProjectAdapter {
  switch (projectType) {
    case 'app':
      return new AppProjectAdapter();
    case 'workflow':
      return new WorkflowProjectAdapter();
    default:
      throw new Error(`Unknown project type: ${projectType}`);
  }
}
