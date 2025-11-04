import { TemplateDetails, FileTreeNode } from '../../services/sandbox/sandboxTypes';
import { WorkflowMetadata } from '../core/state';

export interface WorkflowScaffoldOptions {
    workflowName: string;
    workflowClassName: string;
    workflowCode?: string;
    metadata?: WorkflowMetadata;
}

export function extractWorkflowClassName(code: string): string {
    const match = code.match(/export\s+class\s+(\w+)\s+extends\s+WorkflowEntrypoint/);
    return match ? match[1] : 'MyWorkflow';
}

export function generateWorkflowScaffold(options: WorkflowScaffoldOptions): TemplateDetails {
    const { workflowName, workflowClassName, workflowCode, metadata } = options;
    
    const packageJson = {
        name: workflowName,
        version: "1.0.0",
        private: true,
        scripts: {
            dev: "wrangler dev --local",
            deploy: "wrangler deploy"
        },
        devDependencies: {
            "@cloudflare/workers-types": "^4.20250417.0",
            "typescript": "^5.0.4",
            "wrangler": "^4.38.0"
        }
    };
    
    const wranglerConfig: Record<string, unknown> = {
        name: workflowName,
        main: "src/index.ts",
        compatibility_date: "2025-10-08",
        observability: {
            enabled: true,
            head_sampling_rate: 1
        },
        workflows: [{
            name: workflowName,
            binding: "MY_WORKFLOW",
            class_name: workflowClassName
        }]
    };
    
    if (metadata?.bindings) {
        const vars: Record<string, string> = {};
        
        if (metadata.bindings.envVars) {
            Object.entries(metadata.bindings.envVars).forEach(([key, config]) => {
                vars[key] = config.default || '';
            });
        }
        
        if (metadata.bindings.secrets) {
            Object.entries(metadata.bindings.secrets).forEach(([key, _config]) => {
                vars[key] = '';
            });
        }
        
        if (Object.keys(vars).length > 0) {
            wranglerConfig.vars = vars;
        }
        
        if (metadata.bindings.resources) {
            for (const [name, config] of Object.entries(metadata.bindings.resources)) {
                switch (config.type) {
                    case 'kv':
                        if (!wranglerConfig.kv_namespaces) wranglerConfig.kv_namespaces = [];
                        (wranglerConfig.kv_namespaces as Array<{ binding: string; id: string }>).push({
                            binding: name,
                            id: `local-kv-${name.toLowerCase().replace(/_/g, '-')}`
                        });
                        break;
                    case 'r2':
                        if (!wranglerConfig.r2_buckets) wranglerConfig.r2_buckets = [];
                        (wranglerConfig.r2_buckets as Array<{ binding: string; bucket_name: string }>).push({
                            binding: name,
                            bucket_name: `local-r2-${name.toLowerCase().replace(/_/g, '-')}`
                        });
                        break;
                    case 'd1':
                        if (!wranglerConfig.d1_databases) wranglerConfig.d1_databases = [];
                        (wranglerConfig.d1_databases as Array<{ binding: string; database_name: string; database_id: string }>).push({
                            binding: name,
                            database_name: `local-d1-${name.toLowerCase().replace(/_/g, '-')}`,
                            database_id: `local-d1-${name.toLowerCase().replace(/_/g, '-')}`
                        });
                        break;
                    case 'queue':
                        if (!wranglerConfig.queues) wranglerConfig.queues = {};
                        if (!(wranglerConfig.queues as { producers?: Array<{ binding: string; queue: string }> }).producers) {
                            (wranglerConfig.queues as { producers: Array<{ binding: string; queue: string }> }).producers = [];
                        }
                        (wranglerConfig.queues as { producers: Array<{ binding: string; queue: string }> }).producers.push({
                            binding: name,
                            queue: `local-queue-${name.toLowerCase().replace(/_/g, '-')}`
                        });
                        break;
                    case 'ai':
                        wranglerConfig.ai = { binding: name };
                        break;
                }
            }
        }
    }
    
    const tsConfig = {
        compilerOptions: {
            target: "ES2021",
            lib: ["ES2021"],
            module: "ESNext",
            moduleResolution: "bundler",
            types: ["@cloudflare/workers-types/experimental"],
            resolveJsonModule: true,
            isolatedModules: true,
            strict: true,
            skipLibCheck: true
        },
        exclude: ["node_modules", "dist", ".wrangler"]
    };
    
    const indexTs = workflowCode 
        ? generateIndexWithWorkflow(workflowCode)
        : generateIndexStub(workflowClassName);
    
    const readme = generateWorkflowReadme(metadata);
    
    const fileTree: FileTreeNode = {
        path: '/',
        type: 'directory',
        children: [
            { path: '/src', type: 'directory', children: [
                { path: '/src/index.ts', type: 'file' }
            ]},
            { path: '/package.json', type: 'file' },
            { path: '/wrangler.jsonc', type: 'file' },
            { path: '/tsconfig.json', type: 'file' },
            { path: '/README.md', type: 'file' }
        ]
    };
    
    return {
        name: workflowName,
        description: {
            selection: "Cloudflare Workflow",
            usage: metadata?.description || "AI-generated workflow for automated processes"
        },
        fileTree,
        allFiles: {
            "package.json": JSON.stringify(packageJson, null, 2),
            "wrangler.jsonc": JSON.stringify(wranglerConfig, null, 2),
            "tsconfig.json": JSON.stringify(tsConfig, null, 2),
            "src/index.ts": indexTs,
            "README.md": readme
        },
        deps: packageJson.devDependencies,
        importantFiles: ["src/index.ts", "wrangler.jsonc"],
        dontTouchFiles: ["package.json", "tsconfig.json"],
        redactedFiles: []
    };
}

function generateIndexWithWorkflow(workflowCode: string): string {
    return `import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

${workflowCode}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/trigger' && request.method === 'POST') {
      try {
        const { params } = await request.json() as { params: any };
        
        if (!params) {
          return Response.json({ error: 'params is required' }, { status: 400 });
        }

        const instance = await env.MY_WORKFLOW.create({ params });
        const status = await instance.status();
        
        return Response.json({
          success: true,
          instanceId: instance.id,
          status: status
        });
      } catch (error) {
        console.error('Error triggering workflow:', error);
        return Response.json({
          error: error instanceof Error ? error.message : 'Failed to trigger workflow'
        }, { status: 500 });
      }
    }

    if (url.pathname.startsWith('/instance/') && request.method === 'GET') {
      try {
        const instanceId = url.pathname.split('/instance/')[1];
        
        if (!instanceId) {
          return Response.json({ error: 'Instance ID is required' }, { status: 400 });
        }

        const instance = await env.MY_WORKFLOW.get(instanceId);
        const status = await instance.status();
        
        return Response.json({
          success: true,
          instanceId: instance.id,
          status: status
        });
      } catch (error) {
        console.error('Error getting workflow status:', error);
        return Response.json({
          error: error instanceof Error ? error.message : 'Failed to get workflow status'
        }, { status: 500 });
      }
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    return new Response('Workflow API\\n\\nPOST /trigger - Start workflow\\nGET /instance/:id - Get status\\nGET /health - Health check', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
} satisfies ExportedHandler<Env>;
`;
}

function generateIndexStub(workflowClassName: string): string {
    return `import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

type Params = {
  // Define your workflow parameters here
};

export class ${workflowClassName} extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const result = await step.do('Example step', async () => {
      return { message: 'Hello from workflow!' };
    });
    
    return result;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/trigger' && request.method === 'POST') {
      try {
        const { params } = await request.json() as { params: any };
        const instance = await env.MY_WORKFLOW.create({ params: params || {} });
        const status = await instance.status();
        
        return Response.json({
          success: true,
          instanceId: instance.id,
          status: status
        });
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : 'Failed to trigger workflow'
        }, { status: 500 });
      }
    }

    if (url.pathname.startsWith('/instance/') && request.method === 'GET') {
      try {
        const instanceId = url.pathname.split('/instance/')[1];
        const instance = await env.MY_WORKFLOW.get(instanceId);
        const status = await instance.status();
        
        return Response.json({
          success: true,
          instanceId: instance.id,
          status: status
        });
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : 'Failed to get status'
        }, { status: 500 });
      }
    }

    return new Response('Workflow API', { headers: { 'Content-Type': 'text/plain' } });
  }
} satisfies ExportedHandler<Env>;
`;
}

function generateWorkflowReadme(metadata?: WorkflowMetadata): string {
    if (!metadata) {
        return `# Workflow Project

This is a Cloudflare Workflow project.

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Testing

Trigger the workflow:

\`\`\`bash
curl -X POST http://localhost:8787/trigger \\
  -H "Content-Type: application/json" \\
  -d '{"params": {}}'
\`\`\`

Check workflow status:

\`\`\`bash
curl http://localhost:8787/instance/<instance-id>
\`\`\`

## Deployment

\`\`\`bash
npm run deploy
\`\`\`
`;
    }
    
    const paramsExample = Object.entries(metadata.params || {}).reduce((acc, [key, config]) => {
        acc[key] = config.example !== undefined ? config.example : 
                   config.type === 'string' ? 'example value' :
                   config.type === 'number' ? 0 :
                   config.type === 'boolean' ? true : {};
        return acc;
    }, {} as Record<string, unknown>);
    
    let bindingsSection = '';
    if (metadata.bindings) {
        bindingsSection = '\n## Required Bindings\n\n';
        
        if (metadata.bindings.secrets && Object.keys(metadata.bindings.secrets).length > 0) {
            bindingsSection += '### Secrets\n\n';
            Object.entries(metadata.bindings.secrets).forEach(([key, config]) => {
                bindingsSection += `- \`${key}\`: ${config.description}${config.required ? ' (required)' : ''}\n`;
            });
            bindingsSection += '\n';
        }
        
        if (metadata.bindings.envVars && Object.keys(metadata.bindings.envVars).length > 0) {
            bindingsSection += '### Environment Variables\n\n';
            Object.entries(metadata.bindings.envVars).forEach(([key, config]) => {
                bindingsSection += `- \`${key}\`: ${config.description}${config.default ? ` (default: ${config.default})` : ''}\n`;
            });
            bindingsSection += '\n';
        }
        
        if (metadata.bindings.resources && Object.keys(metadata.bindings.resources).length > 0) {
            bindingsSection += '### Resources\n\n';
            Object.entries(metadata.bindings.resources).forEach(([key, config]) => {
                bindingsSection += `- \`${key}\` (${config.type.toUpperCase()}): ${config.description}\n`;
            });
            bindingsSection += '\n';
        }
    }
    
    return `# ${metadata.name}

${metadata.description}

## Parameters

${Object.entries(metadata.params).map(([key, config]) => 
    `- \`${key}\` (${config.type}): ${config.description}${config.required ? ' **Required**' : ''}`
).join('\n')}
${bindingsSection}
## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Testing

Trigger the workflow:

\`\`\`bash
curl -X POST http://localhost:8787/trigger \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ params: paramsExample }, null, 2).replace(/\n/g, '\n  ')}'
\`\`\`

Check workflow status:

\`\`\`bash
curl http://localhost:8787/instance/<instance-id>
\`\`\`

## Deployment

\`\`\`bash
npm run deploy
\`\`\`
`;
}
