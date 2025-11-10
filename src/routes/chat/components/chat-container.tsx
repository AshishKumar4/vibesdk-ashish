import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

interface ChatContainerProps {
	// Left panel (chat messages and input)
	leftPanel: ReactNode;
	
	// Right panel (preview/editor/blueprint - varies by project type)
	rightPanel: ReactNode;
	
	// Control visibility of right panel
	showRightPanel: boolean;
}

/**
 * ChatContainer - Layout orchestrator for chat UI
 * 
 * Maintains the 40/60 split layout between chat panel and preview/editor panel.
 * This component is project-type agnostic - it simply handles the layout,
 * while specific panels are passed as children.
 * 
 * Layout Structure (preserved from original):
 * - Outer container: full size, flex column
 * - Inner container: flex row with center alignment
 * - Left panel: chat (max-width 512px, 40% of space)
 * - Right panel: preview/editor/blueprint (60% of space, animated)
 */
export function ChatContainer({
	leftPanel,
	rightPanel,
	showRightPanel,
}: ChatContainerProps) {
	return (
		<div className="size-full flex flex-col min-h-0 text-text-primary">
			<div className="flex-1 flex min-h-0 overflow-hidden justify-center">
				{/* Left Panel: Chat Messages & Input */}
				<motion.div
					layout="position"
					className="flex-1 shrink-0 flex flex-col basis-0 max-w-lg relative z-10 h-full min-h-0"
				>
					{leftPanel}
				</motion.div>

				{/* Right Panel: Preview/Editor/Blueprint (conditionally rendered) */}
				<AnimatePresence>
					{showRightPanel && (
						<motion.div
							layout="position"
							className="flex-1 flex shrink-0 basis-0 p-4 pl-0 ml-2 z-30 min-h-0"
							initial={{ opacity: 0, scale: 0.84 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.3, ease: 'easeInOut' }}
						>
							{rightPanel}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
