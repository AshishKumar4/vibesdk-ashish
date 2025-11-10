import { type ReactNode } from 'react';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { UserMessage, AIMessage } from './messages';
import { AgentModeDisplay } from '@/components/agent-mode-display';
import type { ChatMessage } from '../utils/message-helpers';

interface ChatMessagesPanelProps {
	// Loading state
	appLoading: boolean;
	
	// App info
	appTitle?: string;
	chatId?: string;
	query?: string;
	displayQuery: string;
	
	// Agent mode
	agentMode: 'deterministic' | 'smart';
	showAgentMode?: boolean;
	
	// Messages
	mainMessage?: ChatMessage;
	mainMessageActions?: ReactNode; // Actions for main message (e.g., reset button)
	thinkingMessages: ChatMessage[];
	otherMessages: ChatMessage[];
	
	// Project-specific content (PhaseTimeline, DeploymentControls, etc.)
	projectContent?: ReactNode;
	
	// State flags
	isDebugging: boolean;
	isThinking: boolean;
	
	// Refs
	messagesContainerRef: React.RefObject<HTMLDivElement>;
}

/**
 * ChatMessagesPanel - Scrollable messages container
 * 
 * Displays chat messages in a scrollable area with support for:
 * - Initial user message
 * - Main AI response
 * - Thinking/streaming messages
 * - Project-specific content (timeline, controls, etc.)
 * - Conversational messages
 * 
 * Project-specific content is passed via `projectContent` prop,
 * making this component reusable for both apps and workflows.
 */
export function ChatMessagesPanel({
	appLoading,
	appTitle,
	chatId,
	query,
	displayQuery,
	agentMode,
	showAgentMode,
	mainMessage,
	mainMessageActions,
	thinkingMessages,
	otherMessages,
	projectContent,
	isDebugging,
	isThinking,
	messagesContainerRef,
}: ChatMessagesPanelProps) {
	return (
		<div 
			className={clsx(
				'flex-1 overflow-y-auto min-h-0 chat-messages-scroll',
				isDebugging && 'animate-debug-pulse'
			)} 
			ref={messagesContainerRef}
		>
			<div className="pt-5 px-4 pb-4 text-sm flex flex-col gap-5">
				{/* Loading State */}
				{appLoading ? (
					<div className="flex items-center gap-2 text-text-tertiary">
						<LoaderCircle className="size-4 animate-spin" />
						Loading app...
					</div>
				) : (
					<>
						{/* App Title */}
						{(appTitle || chatId) && (
							<div className="flex items-center justify-between mb-2">
								<div className="text-lg font-semibold">{appTitle}</div>
							</div>
						)}
						
						{/* Initial User Message */}
						<UserMessage message={query ?? displayQuery} />
						
						{/* Agent Mode Display */}
						{showAgentMode && (
							<div className="flex justify-between items-center py-2 border-b border-border-primary/50 mb-4">
								<AgentModeDisplay mode={agentMode} />
							</div>
						)}
					</>
				)}

				{/* Main AI Message */}
				{mainMessage && (
					<div className="relative">
						<AIMessage
							message={mainMessage.content}
							isThinking={mainMessage.ui?.isThinking ?? false}
							toolEvents={mainMessage.ui?.toolEvents}
						/>
						{mainMessageActions}
					</div>
				)}

				{/* Thinking Messages (actively streaming) */}
				{thinkingMessages
					.filter(message => message.role === 'assistant' && message.ui?.isThinking)
					.map((message) => (
						<div key={message.conversationId} className="mb-4">
							<AIMessage
								message={message.content}
								isThinking={true}
								toolEvents={message.ui?.toolEvents}
							/>
						</div>
					))}

				{/* Fallback Thinking Indicator */}
				{isThinking && !thinkingMessages.some(m => m.ui?.isThinking) && (
					<div className="mb-4">
						<AIMessage
							message="Planning next phase..."
							isThinking={true}
						/>
					</div>
				)}

				{/* Project-Specific Content (PhaseTimeline, DeploymentControls, etc.) */}
				{projectContent}

				{/* Other Conversational Messages */}
				{otherMessages
					.filter(message => !message.ui?.isThinking)
					.map((message) => {
						if (message.role === 'assistant') {
							return (
								<AIMessage
									key={message.conversationId}
									message={message.content}
									isThinking={message.ui?.isThinking}
									toolEvents={message.ui?.toolEvents}
								/>
							);
						}
						return (
							<UserMessage
								key={message.conversationId}
								message={message.content}
							/>
						);
					})}
			</div>
		</div>
	);
}
