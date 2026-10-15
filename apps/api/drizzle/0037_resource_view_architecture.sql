ALTER TABLE "project_items" RENAME TO "project_resources";
--> statement-breakpoint
ALTER TABLE "project_resources" RENAME CONSTRAINT "project_items_pkey" TO "project_resources_pkey";
--> statement-breakpoint
ALTER TABLE "project_resources" RENAME CONSTRAINT "project_items_project_id_projects_id_fk" TO "project_resources_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "project_resources" RENAME CONSTRAINT "project_items_parent_id_project_items_id_fk" TO "project_resources_parent_id_project_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "project_resources" RENAME COLUMN "plugin_id" TO "resource_type_id";
--> statement-breakpoint
ALTER TABLE "project_resources" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_schema_version_positive" CHECK ("schema_version" > 0);
--> statement-breakpoint
UPDATE "project_resources"
SET "resource_type_id" = 'lunaris.folder'
WHERE "resource_type_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "project_resources" ALTER COLUMN "resource_type_id" SET NOT NULL;
--> statement-breakpoint
ALTER INDEX IF EXISTS "pi_project_position_created_idx" RENAME TO "pr_project_position_created_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "pi_project_parent_idx" RENAME TO "pr_project_parent_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "pi_project_document_idx" RENAME TO "pr_project_document_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "pi_name_trgm_idx" RENAME TO "pr_name_trgm_idx";
