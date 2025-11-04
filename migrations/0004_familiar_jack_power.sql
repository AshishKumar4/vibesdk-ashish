ALTER TABLE `apps` ADD `project_type` text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE `apps` ADD `deployment_target` text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE `apps` ADD `workflow_metadata` text;--> statement-breakpoint
CREATE INDEX `apps_project_type_idx` ON `apps` (`project_type`);--> statement-breakpoint
CREATE INDEX `apps_deployment_target_idx` ON `apps` (`deployment_target`);