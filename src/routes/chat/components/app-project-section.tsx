import { motion } from 'framer-motion';
import { PhaseTimeline } from './phase-timeline';
import { DeploymentControls } from './deployment-controls';
import type { PhaseTimelineItem } from '../hooks/use-chat';
import type { FileType } from '../hooks/use-chat';
import type { ProjectStage } from '../utils/project-stage-helpers';

interface AppProjectSectionProps {
	// Phase timeline
	projectStages: ProjectStage[];
	phaseTimeline: PhaseTimelineItem[];
	files: FileType[];
	view: 'editor' | 'preview' | 'blueprint' | 'terminal';
	activeFile?: FileType;
	onFileClick: (file: FileType) => void;
	isThinkingNext: boolean;
	isPreviewDeploying: boolean;
	progress: number;
	total: number;
	parentScrollRef: React.RefObject<HTMLDivElement>;
	onViewChange: (view: 'editor' | 'preview' | 'blueprint' | 'terminal') => void;
	
	// Deployment controls
	chatId?: string;
	isPhase1Complete: boolean;
	isDeploying: boolean;
	deploymentUrl?: string;
	cloudflareDeploymentUrl?: string; // Also accept for workflow compatibility
	instanceId: string;
	isRedeployReady: boolean;
	deploymentError?: string;
	appId?: string;
	appVisibility?: 'public' | 'private';
	isGenerating: boolean;
	isPaused: boolean;
	onDeploy: (instanceId: string) => Promise<void>;
	onStopGeneration: () => void;
	onResumeGeneration: () => void;
	onVisibilityUpdate: (visibility: string) => void;
	
	// Debugging info
	runtimeErrorCount: number;
	staticIssueCount: number;
	isDebugging: boolean;
	isThinking: boolean;
	handleDeployToCloudflare: (chatId: string) => Promise<void>;
	
	// Ref for controls
	deploymentControlsRef: React.RefObject<HTMLDivElement>;
}

/**
 * AppProjectSection - App-specific timeline and controls
 * 
 * Renders PhaseTimeline and DeploymentControls for app generation projects.
 * This component is designed to be inserted into ChatMessagesPanel's `projectContent` slot.
 */
export function AppProjectSection({
	projectStages,
	phaseTimeline,
	files,
	view,
	activeFile,
	onFileClick,
	isThinkingNext,
	isPreviewDeploying,
	progress,
	total,
	parentScrollRef,
	onViewChange,
	chatId,
	isPhase1Complete,
	isDeploying,
	deploymentUrl,
	instanceId,
	isRedeployReady,
	deploymentError,
	appId,
	appVisibility,
	isGenerating,
	isPaused,
	onDeploy,
	onStopGeneration,
	onResumeGeneration,
	onVisibilityUpdate,
	runtimeErrorCount,
	staticIssueCount,
	isDebugging,
	isThinking,
	handleDeployToCloudflare,
	deploymentControlsRef,
}: AppProjectSectionProps) {
	return (
		<>
			{/* Phase Timeline */}
			<PhaseTimeline
				projectStages={projectStages}
				phaseTimeline={phaseTimeline}
				files={files}
				view={view}
				activeFile={activeFile}
				onFileClick={onFileClick}
				isThinkingNext={isThinkingNext}
				isPreviewDeploying={isPreviewDeploying}
				progress={progress}
				total={total}
				parentScrollRef={parentScrollRef}
				onViewChange={onViewChange}
				chatId={chatId}
				isDeploying={isDeploying}
				handleDeployToCloudflare={handleDeployToCloudflare}
				runtimeErrorCount={runtimeErrorCount}
				staticIssueCount={staticIssueCount}
				isDebugging={isDebugging}
				isGenerating={isGenerating}
				isThinking={isThinking}
			/>

			{/* Deployment and Generation Controls */}
			{chatId && (
				<motion.div
					ref={deploymentControlsRef}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, delay: 0.2 }}
					className="px-4 mb-6"
				>
					<DeploymentControls
						isPhase1Complete={isPhase1Complete}
						isDeploying={isDeploying}
						deploymentUrl={deploymentUrl}
						instanceId={instanceId}
						isRedeployReady={isRedeployReady}
						deploymentError={deploymentError}
						appId={appId}
						appVisibility={appVisibility}
						isGenerating={isGenerating}
						isPaused={isPaused}
						onDeploy={onDeploy}
						onStopGeneration={onStopGeneration}
						onResumeGeneration={onResumeGeneration}
						onVisibilityUpdate={onVisibilityUpdate}
					/>
				</motion.div>
			)}
		</>
	);
}
