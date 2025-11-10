
import { ProjectAgent } from './core/projectAgent';
import { getAgentByName } from 'agents';
import { CodeGenState, WorkflowGenState } from './core/state';
import { generateId } from '../utils/idGenerator';
import { StructuredLogger } from '../logger';
import { InferenceContext } from './inferutils/config.types';
import { SandboxSdkClient } from '../services/sandbox/sandboxSdkClient';
import { selectTemplate } from './planning/templateSelector';
import { TemplateDetails } from '../services/sandbox/sandboxTypes';
import { TemplateSelection } from './schemas';
import type { ImageAttachment } from '../types/image-attachment';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import { ProjectType } from './core/types';

export async function getAgentStub(env: Env, agentId: string) : Promise<DurableObjectStub<ProjectAgent>> {
    return getAgentByName<Env, ProjectAgent>(env.CodeGenObject, agentId);
}

export async function createAgent(env: Env, agentId: string, projectType: ProjectType): Promise<DurableObjectStub<ProjectAgent>> {
    // Always returns ProjectAgent stub - the projectType is passed via props
    // and the ProjectAgent constructor routes to the appropriate concrete agent
    return getAgentByName<Env, ProjectAgent>(env.CodeGenObject, agentId, {
        props: { projectType }
    });
}

export async function getAgentState(env: Env, agentId: string) : Promise<CodeGenState | WorkflowGenState> {
    const agentInstance = await getAgentStub(env, agentId);
    return await agentInstance.getFullState() as CodeGenState | WorkflowGenState;
}

export async function cloneAgent(env: Env, agentId: string) : Promise<{newAgentId: string, newAgent: DurableObjectStub<ProjectAgent>}> {
    const agentInstance = await getAgentStub(env, agentId);
    if (!agentInstance || !await agentInstance.isInitialized()) {
        throw new Error(`Agent ${agentId} not found`);
    }
    const newAgentId = generateId();
    const projectType = await agentInstance.getProjectType();

    const newAgent = await createAgent(env, newAgentId, projectType);
    const originalState = await agentInstance.getFullState();
    const newState = {
        ...originalState,
        sessionId: newAgentId,
        sandboxInstanceId: undefined,
        pendingUserInputs: [],
        currentDevState: 0,
        generationPromise: undefined,
        shouldBeGenerating: false,
        clientReportedErrors: [],
    } as CodeGenState | WorkflowGenState;

    await newAgent.setState(newState);
    return {newAgentId, newAgent};
}

export async function getTemplateForQuery(
    env: Env,
    inferenceContext: InferenceContext,
    query: string,
    images: ImageAttachment[] | undefined,
    logger: StructuredLogger,
) : Promise<{templateDetails: TemplateDetails, selection: TemplateSelection}> {
    // Fetch available templates
    const templatesResponse = await SandboxSdkClient.listTemplates();
    if (!templatesResponse || !templatesResponse.success) {
        throw new Error(`Failed to fetch templates from sandbox service, ${templatesResponse.error}`);
    }
        
    const analyzeQueryResponse = await selectTemplate({
        env,
        inferenceContext,
        query,
        availableTemplates: templatesResponse.templates,
        images,
    });
    
    logger.info('Selected template', { selectedTemplate: analyzeQueryResponse });
            
    if (!analyzeQueryResponse.selectedTemplateName) {
        logger.error('No suitable template found for code generation');
        throw new Error('No suitable template found for code generation');
    }
            
    const selectedTemplate = templatesResponse.templates.find(template => template.name === analyzeQueryResponse.selectedTemplateName);
    if (!selectedTemplate) {
        logger.error('Selected template not found');
        throw new Error('Selected template not found');
    }
    const templateDetailsResponse = await BaseSandboxService.getTemplateDetails(selectedTemplate.name);
    if (!templateDetailsResponse.success || !templateDetailsResponse.templateDetails) {
        logger.error('Failed to fetch files', { templateDetailsResponse });
        throw new Error('Failed to fetch files');
    }
            
    const templateDetails = templateDetailsResponse.templateDetails;
    return { templateDetails, selection: analyzeQueryResponse };
}