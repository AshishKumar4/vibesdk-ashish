import { type FormEvent } from 'react';
import { ArrowRight, Image as ImageIcon, X } from 'react-feather';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { SUPPORTED_IMAGE_MIME_TYPES, type ImageAttachment } from '@/api-types';
import { sendWebSocketMessage } from '../utils/websocket-helpers';
import type { WebSocket } from 'partysocket';

interface ChatInputProps {
	// Input state
	newMessage: string;
	onNewMessageChange: (message: string) => void;
	onSubmit: (e: FormEvent) => void;
	
	// Image handling
	images: ImageAttachment[];
	onAddImages: (files: File[]) => void;
	onRemoveImage: (id: string) => void;
	imageInputRef: React.RefObject<HTMLInputElement>;
	isProcessing: boolean;
	
	// Drag and drop
	isDragging: boolean;
	dragHandlers: Record<string, unknown>;
	
	// State flags
	isChatDisabled: boolean;
	isDebugging: boolean;
	isGenerating: boolean;
	isGeneratingBlueprint: boolean;
	
	// WebSocket
	websocket?: WebSocket;
	
	// Refs
	chatFormRef: React.RefObject<HTMLFormElement>;
}

const MAX_WORDS = 4000;

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * ChatInput - Chat input form component
 * 
 * Handles:
 * - Text input with auto-resize
 * - Image upload and preview
 * - Drag & drop support
 * - Word count validation
 * - Stop generation button
 * - Keyboard shortcuts (Enter to send, Shift+Enter for newline)
 */
export function ChatInput({
	newMessage,
	onNewMessageChange,
	onSubmit,
	images,
	onAddImages,
	onRemoveImage,
	imageInputRef,
	isProcessing,
	isDragging,
	dragHandlers,
	isChatDisabled,
	isDebugging,
	isGenerating,
	isGeneratingBlueprint,
	websocket,
	chatFormRef,
}: ChatInputProps) {
	return (
		<form
			ref={chatFormRef}
			onSubmit={onSubmit}
			className="shrink-0 p-4 pb-5 bg-transparent"
			{...dragHandlers}
		>
			{/* Hidden file input */}
			<input
				ref={imageInputRef}
				type="file"
				accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
				multiple
				onChange={(e) => {
					const files = Array.from(e.target.files || []);
					if (files.length > 0) {
						onAddImages(files);
					}
					e.target.value = '';
				}}
				className="hidden"
				disabled={isChatDisabled}
			/>
			
			<div className="relative">
				{/* Drag Drop Overlay */}
				{isDragging && (
					<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-xl z-50 pointer-events-none">
						<p className="text-accent font-medium">Drop images here</p>
					</div>
				)}
				
				{/* Image Previews */}
				{images.length > 0 && (
					<div className="mb-2">
						<ImageAttachmentPreview
							images={images}
							onRemove={onRemoveImage}
							compact
						/>
					</div>
				)}
				
				{/* Text Input */}
				<textarea
					value={newMessage}
					onChange={(e) => {
						const newValue = e.target.value;
						const newWordCount = countWords(newValue);
						
						// Only update if within word limit
						if (newWordCount <= MAX_WORDS) {
							onNewMessageChange(newValue);
							const ta = e.currentTarget;
							ta.style.height = 'auto';
							ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
						}
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							if (!e.shiftKey) {
								// Submit on Enter without Shift
								e.preventDefault();
								onSubmit(e);
							}
							// Shift+Enter will create a new line (default textarea behavior)
						}
					}}
					disabled={isChatDisabled}
					placeholder={
						isDebugging
							? 'Deep debugging in progress... Please abort to continue'
							: isChatDisabled
								? 'Please wait for blueprint completion...'
								: 'Chat with AI...'
					}
					rows={1}
					className="w-full bg-bg-2 border border-text-primary/10 rounded-xl px-3 pr-20 py-2 text-sm outline-none focus:border-white/20 drop-shadow-2xl text-text-primary placeholder:text-text-primary/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-[36px] max-h-[120px]"
					style={{
						height: 'auto',
						minHeight: '36px'
					}}
					ref={(textarea) => {
						if (textarea) {
							textarea.style.height = 'auto';
							textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
						}
					}}
				/>
				
				{/* Action Buttons */}
				<div className="absolute right-1.5 bottom-2.5 flex items-center gap-1">
					{/* Stop Generation Button */}
					{(isGenerating || isGeneratingBlueprint || isDebugging) && (
						<button
							type="button"
							onClick={() => {
								if (websocket) {
									sendWebSocketMessage(websocket, 'stop_generation');
								}
							}}
							className="p-1.5 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500 transition-all duration-200 group relative"
							aria-label="Stop generation"
							title="Stop generation"
						>
							<X className="size-4" strokeWidth={2} />
							<span className="absolute -top-8 right-0 px-2 py-1 bg-bg-1 border border-border-primary rounded text-xs text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
								Stop
							</span>
						</button>
					)}
					
					{/* Image Upload Button */}
					<button
						type="button"
						onClick={() => imageInputRef.current?.click()}
						disabled={isChatDisabled || isProcessing}
						className="p-1.5 rounded-md hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Upload image"
						title="Upload image"
					>
						<ImageIcon className="size-4" strokeWidth={1.5} />
					</button>
					
					{/* Submit Button */}
					<button
						type="submit"
						disabled={!newMessage.trim() || isChatDisabled}
						className="p-1.5 rounded-md bg-accent/90 hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent text-white disabled:text-text-primary transition-colors"
					>
						<ArrowRight className="size-4" />
					</button>
				</div>
			</div>
		</form>
	);
}
