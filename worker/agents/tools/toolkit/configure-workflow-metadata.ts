import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import type { WorkflowMetadata } from 'worker/agents/core/state';
import type { AgenticCodingAgent } from 'worker/agents/core/agenticCodingAgent';

export type ConfigureWorkflowMetadataArgs = WorkflowMetadata;

export type ConfigureWorkflowMetadataResult =
	| {
			success: true;
			message: string;
			metadata: WorkflowMetadata;
	  }
	| ErrorResult;

/**
 * Tool for configuring workflow metadata (params, bindings, etc.)
 * Can be called multiple times to update metadata iteratively
 */
export function createConfigureWorkflowMetadataTool(
	agent: AgenticCodingAgent,
	logger: StructuredLogger
): ToolDefinition<ConfigureWorkflowMetadataArgs, ConfigureWorkflowMetadataResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'configure_workflow_metadata',
			description: `Configure or update workflow metadata including parameters and Cloudflare resource bindings.

This is REQUIRED for Cloudflare Workflows to document:
- What parameters the workflow accepts (Params type)
- What Cloudflare resources it needs (KV, R2, D1, AI, queues)
- What secrets and environment variables are required

Call this tool:
1. After generating workflow code with generate_files
2. When user requests changes to parameters or bindings
3. To update metadata without changing code

The metadata is used to:
- Generate wrangler.jsonc configuration
- Document workflow usage in README
- Validate workflow execution parameters
- Configure deployment bindings`,
			parameters: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						description:
							'Human-readable workflow name (e.g., "Order Processor", "Slack Notifier")',
					},
					description: {
						type: 'string',
						description: 'Clear description of what the workflow does and when to use it',
					},
					params: {
						type: 'object',
						description:
							'Schema for the Params type in the workflow code. Each key must match a parameter name in the Params type definition.',
						additionalProperties: {
							type: 'object',
							properties: {
								type: {
									type: 'string',
									enum: ['string', 'number', 'boolean', 'object'],
									description: 'TypeScript type of this parameter',
								},
								description: {
									type: 'string',
									description: 'What this parameter is for and how it\'s used',
								},
								example: {
									description: 'Example value for this parameter (helps users understand usage)',
								},
								required: {
									type: 'boolean',
									description: 'Whether this parameter must be provided (true) or is optional (false)',
								},
							},
							required: ['type', 'description', 'required'],
						},
					},
					bindings: {
						type: 'object',
						description:
							'Cloudflare resource bindings, environment variables, and secrets the workflow needs',
						properties: {
							envVars: {
								type: 'object',
								description:
									'Non-sensitive environment variables (e.g., API URLs, feature flags, environment names)',
								additionalProperties: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'string',
											description: 'Environment variables are always strings',
										},
										description: {
											type: 'string',
											description: 'What this environment variable configures',
										},
										default: {
											type: 'string',
											description: 'Default value if not provided',
										},
										required: {
											type: 'boolean',
											description: 'Whether this must be set',
										},
									},
									required: ['type', 'description'],
								},
							},
							secrets: {
								type: 'object',
								description:
									'Sensitive values that must be kept secure (e.g., API keys, tokens, webhooks)',
								additionalProperties: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'secret',
											description: 'Secrets are sensitive strings',
										},
										description: {
											type: 'string',
											description: 'What this secret is used for',
										},
										required: {
											type: 'boolean',
											description: 'Whether this secret is mandatory',
										},
									},
									required: ['type', 'description'],
								},
							},
							resources: {
								type: 'object',
								description:
									'Cloudflare resources the workflow uses (automatically provisioned during deployment)',
								additionalProperties: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											enum: ['kv', 'r2', 'd1', 'queue', 'ai'],
											description:
												'Type of Cloudflare resource: kv (KV storage), r2 (object storage), d1 (SQL database), queue (message queue), ai (Workers AI)',
										},
										description: {
											type: 'string',
											description: 'What this resource is used for in the workflow',
										},
										required: {
											type: 'boolean',
											description: 'Whether the workflow needs this resource to function',
										},
									},
									required: ['type', 'description'],
								},
							},
						},
					},
				},
				required: ['name', 'description', 'params'],
			},
		},
		implementation: async (metadata) => {
			try {
				logger.info('Configuring workflow metadata', {
					name: metadata.name,
					paramsCount: Object.keys(metadata.params).length,
					hasBindings: !!metadata.bindings,
					envVarsCount: Object.keys(metadata.bindings?.envVars || {}).length,
					secretsCount: Object.keys(metadata.bindings?.secrets || {}).length,
					resourcesCount: Object.keys(metadata.bindings?.resources || {}).length,
				});

				// Call agent method to store/update metadata
				agent.configureMetadata(metadata);

				const bindingSummary = metadata.bindings
					? [
							metadata.bindings.envVars &&
								`${Object.keys(metadata.bindings.envVars).length} env vars`,
							metadata.bindings.secrets &&
								`${Object.keys(metadata.bindings.secrets).length} secrets`,
							metadata.bindings.resources &&
								`${Object.keys(metadata.bindings.resources).length} resources`,
					  ]
							.filter(Boolean)
							.join(', ')
					: 'no bindings';

				return {
					success: true,
					message: `✅ Workflow metadata configured: "${metadata.name}" with ${Object.keys(metadata.params).length} params${metadata.bindings ? ` and ${bindingSummary}` : ''}`,
					metadata,
				};
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to configure metadata: ${error.message}`
							: 'Unknown error occurred while configuring metadata',
				};
			}
		},
	};
}
