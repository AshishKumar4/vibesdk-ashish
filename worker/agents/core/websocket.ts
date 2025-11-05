import { Connection } from 'agents';
import { createLogger } from '../../logger';
import { WebSocketMessageRequests, WebSocketMessageResponses } from '../constants';
import { SimpleCodeGeneratorAgent } from './simpleGeneratorAgent';
import { MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_SIZE_BYTES } from '../../types/image-attachment';
import { sendToConnection, sendError } from './websocketBroadcast';
import type { BaseProjectAgent } from './baseProjectAgent';
import type { BaseProjectState } from './state';

const logger = createLogger('CodeGeneratorWebSocket');

/**
 * Handles WebSocket messages for any project agent.
 * Works with BaseProjectAgent and uses polymorphic methods that all agents implement.
 */
export function handleWebSocketMessage<TState extends BaseProjectState>(
    agent: BaseProjectAgent<TState>, 
    connection: Connection, 
    message: string
): void {
    try {
        logger.info(`Received WebSocket message from ${connection.id}: ${message}`);
        const parsedMessage = JSON.parse(message);

        switch (parsedMessage.type) {
            case WebSocketMessageRequests.GENERATE_ALL:
                agent.updateState({ shouldBeGenerating: true } as Partial<TState>);
                
                // Check if generation is already active to avoid duplicate processes
                if (agent.isCodeGenerating()) {
                    logger.info('Generation already in progress, skipping duplicate request');
                    // sendToConnection(connection, WebSocketMessageResponses.GENERATION_STARTED, {
                    //     message: 'Code generation is already in progress'
                    // });
                    return;
                }
                
                // Start generation process
                logger.info('Starting code generation process');
                agent.generateAllFiles().catch(error => {
                    logger.error('Error during code generation:', error);
                    sendError(connection, `Error generating files: ${error instanceof Error ? error.message : String(error)}`);
                }).finally(() => {
                    if (!agent.isCodeGenerating()) {
                        agent.updateState({ shouldBeGenerating: false } as Partial<TState>);
                    }
                });
                break;
            case WebSocketMessageRequests.DEPLOY:
                agent.deployToCloudflare().then((deploymentResult) => {
                    if (!deploymentResult) {
                        logger.error('Failed to deploy to Cloudflare Workers');
                        return;
                    }
                    logger.info('Successfully deployed to Cloudflare Workers!', deploymentResult);
                }).catch((error: unknown) => {
                    logger.error('Error during deployment:', error);
                });
                break;
            case WebSocketMessageRequests.PREVIEW:
                // Deploy current state for preview
                logger.info('Deploying for preview');
                agent.deployToSandbox().then((deploymentResult) => {
                    logger.info(`Preview deployed successfully!, deploymentResult:`, deploymentResult);
                }).catch((error: unknown) => {
                    logger.error('Error during preview deployment:', error);
                });
                break;
            case WebSocketMessageRequests.CAPTURE_SCREENSHOT:
                // Only supported for app agents
                if (!(agent instanceof SimpleCodeGeneratorAgent)) {
                    sendError(connection, 'Screenshot capture not supported for this agent type');
                    return;
                }
                
                agent.captureScreenshot(parsedMessage.data.url, parsedMessage.data.viewport).then((screenshotResult) => {
                    if (!screenshotResult) {
                        logger.error('Failed to capture screenshot');
                        return;
                    }
                    logger.info('Screenshot captured successfully!', screenshotResult);
                }).catch((error: unknown) => {
                    logger.error('Error during screenshot capture:', error);
                });
                break;
            case WebSocketMessageRequests.STOP_GENERATION:
                logger.info('User requested to stop generation');
                
                // Cancel current inference operation
                const wasCancelled = agent.cancelCurrentInference();
                
                // Clear shouldBeGenerating flag
                if (agent instanceof SimpleCodeGeneratorAgent) {
                    agent.updateState({ shouldBeGenerating: false } as Partial<TState>);
                }
                
                sendToConnection(connection, WebSocketMessageResponses.GENERATION_STOPPED, {
                    message: wasCancelled 
                        ? 'Inference operation cancelled successfully'
                        : 'No active inference to cancel'
                });
                break;
            case WebSocketMessageRequests.RESUME_GENERATION:
                // Only supported for app agents
                if (!(agent instanceof SimpleCodeGeneratorAgent)) {
                    sendError(connection, 'Resume generation not supported for this agent type');
                    return;
                }
                
                // Set shouldBeGenerating and restart generation
                logger.info('Resuming code generation');
                agent.updateState({ shouldBeGenerating: true } as Partial<TState>);
                
                if (!agent.isCodeGenerating()) {
                    sendToConnection(connection, WebSocketMessageResponses.GENERATION_RESUMED, {
                        message: 'Code generation resumed'
                    });
                    agent.generateAllFiles().catch((error: Error) => {
                        logger.error('Error resuming code generation:', error);
                        sendError(connection, `Error resuming generation: ${error.message}`);
                    });
                }
                break;
            case WebSocketMessageRequests.GITHUB_EXPORT:
                // DEPRECATED: WebSocket-based GitHub export replaced with OAuth flow
                // GitHub Apps require OAuth user access tokens for user repository creation
                sendToConnection(connection, WebSocketMessageResponses.GITHUB_EXPORT_ERROR, {
                    message: 'GitHub export via WebSocket is deprecated',
                    error: 'Please use the GitHub export button which will redirect you to authorize with GitHub OAuth'
                });
                break;
            case WebSocketMessageRequests.USER_SUGGESTION:
                // Only supported for app agents (SimpleCodeGeneratorAgent)
                if (!(agent instanceof SimpleCodeGeneratorAgent)) {
                    sendError(connection, 'USER_SUGGESTION not supported for this agent type');
                    return;
                }
                
                logger.info('Received user suggestion', {
                    messageLength: parsedMessage.message?.length || 0,
                    hasImages: !!parsedMessage.images && parsedMessage.images.length > 0,
                    imageCount: parsedMessage.images?.length || 0
                });
                
                if (!parsedMessage.message) {
                    sendError(connection, 'No message provided in user suggestion');
                    return;
                }
                
                // Validate image count and size
                if (parsedMessage.images && parsedMessage.images.length > 0) {
                    if (parsedMessage.images.length > MAX_IMAGES_PER_MESSAGE) {
                        sendError(connection, `Maximum ${MAX_IMAGES_PER_MESSAGE} images allowed per message. Received ${parsedMessage.images.length} images.`);
                        return;
                    }
                    
                    // Validate each image size
                    for (const image of parsedMessage.images) {
                        if (image.size > MAX_IMAGE_SIZE_BYTES) {
                            sendError(connection, `Image "${image.filename}" exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
                            return;
                        }
                    }
                }
                
                agent.handleUserInput(parsedMessage.message, parsedMessage.images).catch((error: unknown) => {
                    logger.error('Error handling user suggestion:', error);
                    sendError(connection, `Error processing user suggestion: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.GET_MODEL_CONFIGS:
                // Only supported for app agents
                if (!(agent instanceof SimpleCodeGeneratorAgent)) {
                    sendError(connection, 'Model configs not available for this agent type');
                    return;
                }
                
                agent.getModelConfigsInfo().then((configsInfo) => {
                    sendToConnection(connection, WebSocketMessageResponses.MODEL_CONFIGS_INFO, {
                        message: 'Model configurations retrieved',
                        configs: configsInfo
                    });
                }).catch((error: unknown) => {
                    logger.error('Error fetching model configs:', error);
                    sendError(connection, `Error fetching model configurations: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.CLEAR_CONVERSATION:
                logger.info('Clearing conversation history');
                agent.clearConversation();
                break;
            case WebSocketMessageRequests.GET_CONVERSATION_STATE:
                try {
                    const state = agent.getConversationState();
                    const debugState = agent.getDeepDebugSessionState();
                    logger.info('Conversation state retrieved', state);
                    sendToConnection(connection, WebSocketMessageResponses.CONVERSATION_STATE, { 
                        state,
                        deepDebugSession: debugState
                    });
                } catch (error) {
                    logger.error('Error fetching conversation state:', error);
                    sendError(connection, `Error fetching conversation state: ${error instanceof Error ? error.message : String(error)}`);
                }
                break;
            // Disabled it for now
            // case WebSocketMessageRequests.TERMINAL_COMMAND:
            //     // Handle terminal command execution
            //     logger.info('Received terminal command', {
            //         command: parsedMessage.command,
            //         timestamp: parsedMessage.timestamp
            //     });
                
            //     if (!parsedMessage.command) {
            //         sendError(connection, 'No command provided');
            //         return;
            //     }
                
            //     // Execute terminal command  
            //     agent.executeTerminalCommand(parsedMessage.command, connection as any)
            //         .catch((error: unknown) => {
            //             logger.error('Error executing terminal command:', error);
            //             sendToConnection(connection, WebSocketMessageResponses.TERMINAL_OUTPUT, {
            //                 output: `Error: ${error instanceof Error ? error.message : String(error)}`,
            //                 outputType: 'stderr' as const,
            //                 timestamp: Date.now()
            //             });
            //         });
            //     break;
            default:
                sendError(connection, `Unknown message type: ${parsedMessage.type}`);
        }
    } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        sendError(connection, `Error processing message: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function handleWebSocketClose(connection: Connection): void {
    logger.info(`WebSocket connection closed: ${connection.id}`);
}