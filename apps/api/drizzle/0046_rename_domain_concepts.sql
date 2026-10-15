ALTER TYPE "public"."project_role" RENAME TO "workspace_role";--> statement-breakpoint
ALTER TYPE "public"."project_visibility" RENAME TO "workspace_visibility";--> statement-breakpoint
ALTER TABLE "workspace_extension_registries" RENAME TO "organization_extension_registries";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "install_official_extension_registry"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	INSERT INTO public.organization_extension_registries (
		id, organization_id, kind, location, manifest_url, official
	)
	VALUES (
		'lunaris-official',
		NEW.id,
		'github',
		'https://github.com/LunarisApp/extensions',
		'https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json',
		true
	)
	ON CONFLICT (organization_id, id) DO NOTHING;
	RETURN NEW;
END;
$$;--> statement-breakpoint
ALTER TABLE "project_extensions" RENAME TO "workspace_extensions";--> statement-breakpoint
ALTER TABLE "project_members" RENAME TO "workspace_members";--> statement-breakpoint
ALTER TABLE "project_resource_trash" RENAME TO "workspace_resource_trash";--> statement-breakpoint
ALTER TABLE "project_resources" RENAME TO "workspace_resources";--> statement-breakpoint
ALTER TABLE "project_storage_slots" RENAME TO "workspace_storage_slots";--> statement-breakpoint
ALTER TABLE "project_storage_values" RENAME TO "workspace_storage_values";--> statement-breakpoint
ALTER TABLE "projects" RENAME TO "workspaces";--> statement-breakpoint
ALTER TABLE "workspace_extensions" RENAME CONSTRAINT "project_extensions_pkey" TO "workspace_extensions_pkey";--> statement-breakpoint
ALTER TABLE "workspace_members" RENAME CONSTRAINT "project_members_pkey" TO "workspace_members_pkey";--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" RENAME CONSTRAINT "project_resource_trash_pkey" TO "workspace_resource_trash_pkey";--> statement-breakpoint
ALTER TABLE "workspace_resources" RENAME CONSTRAINT "project_resources_pkey" TO "workspace_resources_pkey";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" RENAME CONSTRAINT "project_storage_slots_pkey" TO "workspace_storage_slots_pkey";--> statement-breakpoint
ALTER TABLE "workspace_storage_values" RENAME CONSTRAINT "project_storage_values_pkey" TO "workspace_storage_values_pkey";--> statement-breakpoint
ALTER TABLE "workspaces" RENAME CONSTRAINT "projects_pkey" TO "workspaces_pkey";--> statement-breakpoint
ALTER TABLE "agent_action_previews" RENAME COLUMN "workspace_id" TO "organization_id";--> statement-breakpoint
ALTER TABLE "agent_audit_events" RENAME COLUMN "workspace_id" TO "organization_id";--> statement-breakpoint
ALTER TABLE "workspace_extensions" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_members" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_members" RENAME COLUMN "workspace_member_id" TO "organization_member_id";--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_resources" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_storage_values" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "yjs_document_updates" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "yjs_documents" RENAME COLUMN "project_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_resource_project_fk";
--> statement-breakpoint
ALTER TABLE "workspace_storage_values" DROP CONSTRAINT "project_storage_values_storage_project_fk";
--> statement-breakpoint
ALTER TABLE "organization_extension_registries" DROP CONSTRAINT "workspace_extension_registries_org_location_unique";--> statement-breakpoint
ALTER TABLE "workspace_extensions" DROP CONSTRAINT "project_extensions_project_extension_unique";--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "project_members_project_workspace_member_unique";--> statement-breakpoint
ALTER TABLE "workspace_resources" DROP CONSTRAINT "project_resources_id_project_unique";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_id_project_unique";--> statement-breakpoint
ALTER TABLE "workspace_storage_values" DROP CONSTRAINT "project_storage_values_storage_key_unique";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "projects_org_slug_unique";--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" DROP CONSTRAINT "project_resource_trash_deadline_valid";--> statement-breakpoint
ALTER TABLE "workspace_resources" DROP CONSTRAINT "project_resources_schema_version_positive";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_scope_check";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_kind_check";--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_backing_check";--> statement-breakpoint
ALTER TABLE "organization_extension_registries" DROP CONSTRAINT "workspace_extension_registries_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "organization_extension_registries" DROP CONSTRAINT "workspace_extension_registries_added_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_extensions" DROP CONSTRAINT "project_extensions_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "project_members_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "project_members_workspace_member_id_member_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" DROP CONSTRAINT "project_resource_trash_id_project_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" DROP CONSTRAINT "project_resource_trash_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_resources" DROP CONSTRAINT "project_resources_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_resources" DROP CONSTRAINT "project_resources_parent_id_project_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" DROP CONSTRAINT "project_storage_slots_resource_id_project_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_storage_values" DROP CONSTRAINT "project_storage_values_storage_id_project_storage_slots_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_storage_values" DROP CONSTRAINT "project_storage_values_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "projects_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "projects_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "yjs_document_updates" DROP CONSTRAINT "yjs_document_updates_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "yjs_documents" DROP CONSTRAINT "yjs_documents_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "agent_audit_events_workspace_created_idx";--> statement-breakpoint
DROP INDEX "subscription_one_access_plan_per_workspace_idx";--> statement-breakpoint
DROP INDEX "workspace_extension_registries_org_added_idx";--> statement-breakpoint
DROP INDEX "project_extensions_project_enabled_idx";--> statement-breakpoint
DROP INDEX "project_members_project_idx";--> statement-breakpoint
DROP INDEX "project_members_workspace_member_idx";--> statement-breakpoint
DROP INDEX "prt_project_purge_idx";--> statement-breakpoint
DROP INDEX "prt_project_root_idx";--> statement-breakpoint
DROP INDEX "pr_project_position_created_idx";--> statement-breakpoint
DROP INDEX "pr_project_parent_idx";--> statement-breakpoint
DROP INDEX "project_storage_slots_resource_name_unique";--> statement-breakpoint
DROP INDEX "project_storage_slots_project_plugin_name_unique";--> statement-breakpoint
DROP INDEX "project_storage_slots_project_idx";--> statement-breakpoint
DROP INDEX "project_storage_slots_resource_idx";--> statement-breakpoint
DROP INDEX "project_storage_values_project_idx";--> statement-breakpoint
DROP INDEX "projects_org_visibility_updated_idx";--> statement-breakpoint
DROP INDEX "projects_org_owner_visibility_updated_idx";--> statement-breakpoint
DROP INDEX "yjs_documents_project_updated_idx";--> statement-breakpoint
ALTER TABLE "organization_extension_registries" DROP CONSTRAINT "workspace_extension_registries_organization_id_id_pk";--> statement-breakpoint
ALTER TABLE "organization_extension_registries" ADD CONSTRAINT "organization_extension_registries_organization_id_id_pk" PRIMARY KEY("organization_id","id");--> statement-breakpoint
ALTER TABLE "organization_extension_registries" ADD CONSTRAINT "organization_extension_registries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_extension_registries" ADD CONSTRAINT "organization_extension_registries_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD CONSTRAINT "workspace_resources_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "workspace_extensions" ADD CONSTRAINT "workspace_extensions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_organization_member_id_member_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" ADD CONSTRAINT "workspace_resource_trash_id_workspace_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."workspace_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" ADD CONSTRAINT "workspace_resource_trash_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD CONSTRAINT "workspace_resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD CONSTRAINT "workspace_resources_parent_id_workspace_resources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workspace_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_resource_id_workspace_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."workspace_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_resource_workspace_fk" FOREIGN KEY ("resource_id","workspace_id") REFERENCES "public"."workspace_resources"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_values" ADD CONSTRAINT "workspace_storage_values_storage_id_workspace_storage_slots_id_fk" FOREIGN KEY ("storage_id") REFERENCES "public"."workspace_storage_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_values" ADD CONSTRAINT "workspace_storage_values_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_values" ADD CONSTRAINT "workspace_storage_values_storage_workspace_fk" FOREIGN KEY ("storage_id","workspace_id") REFERENCES "public"."workspace_storage_slots"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD CONSTRAINT "yjs_document_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD CONSTRAINT "yjs_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_audit_events_organization_created_idx" ON "agent_audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_one_access_plan_per_organization_idx" ON "subscription" USING btree ("organization_id") WHERE "subscription"."status" IN ('active', 'trialing');--> statement-breakpoint
CREATE INDEX "organization_extension_registries_org_added_idx" ON "organization_extension_registries" USING btree ("organization_id","added_at");--> statement-breakpoint
CREATE INDEX "workspace_extensions_workspace_enabled_idx" ON "workspace_extensions" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_idx" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_organization_member_idx" ON "workspace_members" USING btree ("organization_member_id");--> statement-breakpoint
CREATE INDEX "workspace_resource_trash_workspace_purge_idx" ON "workspace_resource_trash" USING btree ("workspace_id","purge_at");--> statement-breakpoint
CREATE INDEX "workspace_resource_trash_workspace_root_idx" ON "workspace_resource_trash" USING btree ("workspace_id","trash_root_id");--> statement-breakpoint
CREATE INDEX "workspace_resources_workspace_position_created_idx" ON "workspace_resources" USING btree ("workspace_id","position","created_at","id");--> statement-breakpoint
CREATE INDEX "workspace_resources_workspace_parent_idx" ON "workspace_resources" USING btree ("workspace_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_storage_slots_resource_name_unique" ON "workspace_storage_slots" USING btree ("resource_id","name") WHERE "workspace_storage_slots"."resource_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_storage_slots_workspace_plugin_name_unique" ON "workspace_storage_slots" USING btree ("workspace_id","plugin_id","name") WHERE "workspace_storage_slots"."resource_id" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_storage_slots_workspace_idx" ON "workspace_storage_slots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_storage_slots_resource_idx" ON "workspace_storage_slots" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "workspace_storage_values_workspace_idx" ON "workspace_storage_values" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_org_visibility_updated_idx" ON "workspaces" USING btree ("organization_id","visibility","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "workspaces_org_owner_visibility_updated_idx" ON "workspaces" USING btree ("organization_id","owner_id","visibility","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "yjs_documents_workspace_updated_idx" ON "yjs_documents" USING btree ("workspace_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
ALTER TABLE "organization_extension_registries" ADD CONSTRAINT "organization_extension_registries_org_location_unique" UNIQUE("organization_id","location");--> statement-breakpoint
ALTER TABLE "workspace_extensions" ADD CONSTRAINT "workspace_extensions_workspace_extension_unique" UNIQUE("workspace_id","extension_id");--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_organization_member_unique" UNIQUE("workspace_id","organization_member_id");--> statement-breakpoint
ALTER TABLE "workspace_storage_values" ADD CONSTRAINT "workspace_storage_values_storage_key_unique" UNIQUE("storage_id","key");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_org_slug_unique" UNIQUE("organization_id","slug");--> statement-breakpoint
ALTER TABLE "workspace_resource_trash" ADD CONSTRAINT "workspace_resource_trash_deadline_valid" CHECK ("workspace_resource_trash"."purge_at" > "workspace_resource_trash"."trashed_at");--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD CONSTRAINT "workspace_resources_schema_version_positive" CHECK ("workspace_resources"."schema_version" > 0);--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_scope_check" CHECK (("workspace_storage_slots"."resource_id" IS NOT NULL AND "workspace_storage_slots"."plugin_id" IS NULL) OR ("workspace_storage_slots"."resource_id" IS NULL AND "workspace_storage_slots"."plugin_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_kind_check" CHECK ("workspace_storage_slots"."kind" IN ('file', 'key-value', 'yjs'));--> statement-breakpoint
ALTER TABLE "workspace_storage_slots" ADD CONSTRAINT "workspace_storage_slots_backing_check" CHECK (("workspace_storage_slots"."kind" = 'key-value' AND "workspace_storage_slots"."backing_id" IS NULL) OR ("workspace_storage_slots"."kind" IN ('file', 'yjs') AND "workspace_storage_slots"."backing_id" IS NOT NULL));
