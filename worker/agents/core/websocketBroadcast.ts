/**
 * WebSocket broadcast utilities
 */

import { createLogger } from '../../logger';
import { WebSocketMessage, WebSocketMessageData, WebSocketMessageType } from '../../api/websocketTypes';

const logger = createLogger('WebSocketBroadcast');

/**
 * Broadcast a message to all connections for an agent
 */
export function broadcastToConnections<T extends WebSocketMessageType>(
    agent: { getWebSockets(): WebSocket[] },
    type: T,
    data: WebSocketMessageData<T>
): void {
    const connections = agent.getWebSockets();
    for (const connection of connections) {
        sendToConnection(connection, type, data);
    }
}

/**
 * Send a message to a specific WebSocket connection
 */
export function sendToConnection<T extends WebSocketMessageType>(
    connection: WebSocket, 
    type: T, 
    data: WebSocketMessageData<T>
): void {
    try {
        const message: WebSocketMessage = { type, ...data } as WebSocketMessage;
        connection.send(JSON.stringify(message));
    } catch (error) {
        logger.error('Error sending WebSocket message:', error);
    }
}

/**
 * Send an error message to a connection
 */
export function sendError(connection: WebSocket, errorMessage: string): void {
    sendToConnection(connection, 'error', { error: errorMessage });
}
