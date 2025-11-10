import type { ProjectType, DeploymentTarget } from '@/api-types';

/**
 * Helper function to determine if Cloudflare authentication is required
 * for a given project configuration.
 * 
 * Cloudflare auth is required when:
 * - Project is self-hosted (deploys to user's CF account), OR
 * - Project is a workflow (workflows always deploy to user's CF account)
 * 
 * @param projectType - The type of project ('app' or 'workflow')
 * @param deploymentTarget - Where the project will be deployed ('platform' or 'self-hosted')
 * @returns true if Cloudflare authentication is required
 */
export function requiresCloudflareAuth(
  projectType: ProjectType,
  deploymentTarget: DeploymentTarget
): boolean {
  return deploymentTarget === 'self-hosted' || projectType === 'workflow';
}
