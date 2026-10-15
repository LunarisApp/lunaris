ALTER TABLE "project_data" DROP CONSTRAINT "project_data_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "yjs_document_updates" DROP CONSTRAINT "yjs_document_updates_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "yjs_document_updates" DROP CONSTRAINT "yjs_document_updates_document_id_yjs_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "yjs_documents" DROP CONSTRAINT "yjs_documents_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "project_data" ADD CONSTRAINT "project_data_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD CONSTRAINT "yjs_document_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD CONSTRAINT "yjs_document_updates_document_id_yjs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."yjs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD CONSTRAINT "yjs_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;