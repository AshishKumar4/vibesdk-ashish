import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, CheckCircle, Code, Network } from 'lucide-react';
import { MonacoEditor } from '@/components/monaco-editor/monaco-editor';
import type { FileType } from '../hooks/use-chat';
import type { ProjectStage } from '../utils/project-stage-helpers';
import type { PhaseTimelineItem } from '../hooks/use-chat';

interface WorkflowProjectSectionProps {
	// Workflow-specific props
	files: FileType[];
	isDeploying: boolean;
	cloudflareDeploymentUrl?: string;
	deploymentError?: string;
	isGenerating: boolean;
	chatId?: string;
	handleDeployToCloudflare: (chatId: string) => Promise<void>;
	
	// Shared props from AppProjectSection (mostly ignored but needed for type compatibility)
	projectStages?: ProjectStage[];
	phaseTimeline?: PhaseTimelineItem[];
	view?: 'editor' | 'preview' | 'blueprint' | 'terminal';
	activeFile?: FileType;
	onFileClick?: (file: FileType) => void;
	isThinkingNext?: boolean;
	isPreviewDeploying?: boolean;
	progress?: number;
	total?: number;
	parentScrollRef?: React.RefObject<HTMLDivElement>;
	onViewChange?: (view: 'editor' | 'preview' | 'blueprint' | 'terminal') => void;
	isPhase1Complete?: boolean;
	deploymentUrl?: string;
	instanceId?: string;
	isRedeployReady?: boolean;
	appId?: string;
	appVisibility?: 'public' | 'private';
	isPaused?: boolean;
	onDeploy?: (instanceId: string) => Promise<void>;
	onStopGeneration?: () => void;
	onResumeGeneration?: () => void;
	onVisibilityUpdate?: (visibility: string) => void;
	runtimeErrorCount?: number;
	staticIssueCount?: number;
	isDebugging?: boolean;
	isThinking?: boolean;
	deploymentControlsRef?: React.RefObject<HTMLDivElement>;
}

/**
 * WorkflowProjectSection - Workflow-specific UI
 * 
 * Shows:
 * - Code view (single workflow file)
 * - Workflow diagram (visual representation)
 * - Deployment status
 * - Cloudflare-specific controls
 */
export function WorkflowProjectSection({
	files,
	isDeploying,
	cloudflareDeploymentUrl,
	deploymentError,
	isGenerating,
	chatId,
	handleDeployToCloudflare,
}: WorkflowProjectSectionProps) {
	const [activeTab, setActiveTab] = useState<'code' | 'diagram'>('code');
	
	// Find the main workflow file (src/index.ts)
	const workflowFile = files.find(f => f.filePath === 'src/index.ts' || f.filePath === 'index.ts') || files[0];
	
	// Deployment status
	const isDeployed = !!cloudflareDeploymentUrl;
	const hasFiles = files.length > 0;
	const canDeploy = hasFiles && !isGenerating && !isDeploying && chatId;

	return (
		<div className="flex flex-col h-full">
			{/* Deployment Status Banner */}
			{isDeployed && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mx-4 mt-4 mb-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
				>
					<div className="flex items-start gap-2">
						<CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-text-primary">Workflow Deployed Successfully</p>
							<a
								href={cloudflareDeploymentUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-green-500 hover:underline break-all"
							>
								{cloudflareDeploymentUrl}
							</a>
						</div>
					</div>
				</motion.div>
			)}

			{/* Deploying State */}
			{isDeploying && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mx-4 mt-4 mb-2 p-3 bg-accent/10 border border-accent/20 rounded-lg"
				>
					<div className="flex items-center gap-2">
						<Loader2 className="w-4 h-4 text-accent animate-spin" />
						<p className="text-sm text-text-primary">Deploying workflow to Cloudflare...</p>
					</div>
				</motion.div>
			)}

			{/* Deployment Error */}
			{deploymentError && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mx-4 mt-4 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
				>
					<div className="flex items-start gap-2">
						<AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
						<div className="flex-1">
							<p className="text-sm font-medium text-text-primary">Deployment Failed</p>
							<p className="text-xs text-text-secondary mt-1">{deploymentError}</p>
						</div>
					</div>
				</motion.div>
			)}

			{/* Code / Diagram Tabs */}
			<div className="px-4 mb-2">
				<div className="flex gap-2 border-b border-text/10">
					<button
						onClick={() => setActiveTab('code')}
						className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							activeTab === 'code'
								? 'border-accent text-accent'
								: 'border-transparent text-text-secondary hover:text-text-primary'
						}`}
					>
						<Code className="w-4 h-4" />
						Workflow Code
					</button>
					<button
						onClick={() => setActiveTab('diagram')}
						className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							activeTab === 'diagram'
								? 'border-accent text-accent'
								: 'border-transparent text-text-secondary hover:text-text-primary'
						}`}
					>
						<Network className="w-4 h-4" />
						Workflow Diagram
					</button>
				</div>
			</div>

			{/* Tab Content */}
			<div className="flex-1 px-4 pb-4 min-h-0">
				{activeTab === 'code' && workflowFile && (
					<div className="h-full rounded-lg overflow-hidden border border-text/10">
						<MonacoEditor
							className="h-full"
							createOptions={{
								value: workflowFile.fileContents,
								language: 'typescript',
								readOnly: true,
								minimap: { enabled: false },
								fontSize: 13,
								lineNumbers: 'on',
								scrollBeyondLastLine: false,
								wordWrap: 'on',
								theme: 'vibesdk',
								automaticLayout: true,
							}}
						/>
					</div>
				)}

				{activeTab === 'code' && !workflowFile && (
					<div className="h-full flex items-center justify-center border border-text/10 rounded-lg bg-bg-3">
						<p className="text-text-secondary">No workflow file generated yet...</p>
					</div>
				)}

				{activeTab === 'diagram' && (
					<WorkflowDiagram code={workflowFile?.fileContents || ''} />
				)}
			</div>

			{/* Deploy Button */}
			{!isDeployed && canDeploy && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="px-4 pb-4"
				>
					<button
						onClick={() => chatId && handleDeployToCloudflare(chatId)}
						disabled={isDeploying || !canDeploy}
						className="w-full px-4 py-3 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
					>
						{isDeploying ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Deploying to Cloudflare...
							</>
						) : (
							<>
								<Network className="w-4 h-4" />
								Deploy Workflow to Cloudflare
							</>
						)}
					</button>
					<p className="text-xs text-text-tertiary text-center mt-2">
						Workflow will be deployed to your Cloudflare account
					</p>
				</motion.div>
			)}

			{/* Generation in progress message */}
			{isGenerating && !hasFiles && (
				<div className="px-4 pb-4">
					<div className="p-4 border border-text/10 rounded-lg bg-bg-3">
						<div className="flex items-center gap-2 text-text-secondary">
							<Loader2 className="w-4 h-4 animate-spin text-accent" />
							<p className="text-sm">Generating workflow code...</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * WorkflowDiagram - Visual representation of workflow steps
 * 
 * Parses the workflow code to extract step.do() calls and displays them
 * as a visual flow diagram.
 */
function WorkflowDiagram({ code }: { code: string }) {
	const steps = parseWorkflowSteps(code);

	if (steps.length === 0) {
		return (
			<div className="h-full flex flex-col items-center justify-center border border-text/10 rounded-lg bg-bg-3 p-8">
				<Network className="w-12 h-12 text-text-tertiary mb-4" />
				<p className="text-text-secondary text-center">
					No workflow steps detected yet.
					<br />
					<span className="text-xs text-text-tertiary mt-1 block">
						Workflow steps will appear here as they're generated
					</span>
				</p>
			</div>
		);
	}

	return (
		<div className="h-full border border-text/10 rounded-lg bg-bg-3 p-6 overflow-auto">
			<div className="flex flex-col gap-4">
				{steps.map((step, index) => (
					<div key={index} className="flex flex-col gap-2">
						<div className="flex items-start gap-3">
							<div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-medium text-sm">
								{index + 1}
							</div>
							<div className="flex-1 p-3 bg-bg-4 border border-text/10 rounded-lg">
								<p className="text-sm font-medium text-text-primary">{step.name}</p>
								{step.description && (
									<p className="text-xs text-text-secondary mt-1">{step.description}</p>
								)}
							</div>
						</div>
						{index < steps.length - 1 && (
							<div className="ml-4 w-0.5 h-4 bg-accent/20" />
						)}
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Parse workflow steps from TypeScript code
 * 
 * Extracts step.do() calls and attempts to infer step names and descriptions
 */
function parseWorkflowSteps(code: string): Array<{ name: string; description?: string }> {
	if (!code) return [];

	const steps: Array<{ name: string; description?: string }> = [];
	
	// Match step.do('name', ...) patterns
	const stepRegex = /step\.do\s*\(\s*['"`]([^'"`]+)['"`]/g;
	let match;
	
	while ((match = stepRegex.exec(code)) !== null) {
		const stepName = match[1];
		steps.push({
			name: stepName,
			description: undefined, // Could enhance with JSDoc parsing
		});
	}

	return steps;
}
