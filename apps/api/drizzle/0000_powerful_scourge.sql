CREATE TABLE "project_data" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "yjs_document_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"document_id" text NOT NULL,
	"update_data" "bytea" NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yjs_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_data" ADD CONSTRAINT "project_data_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD CONSTRAINT "yjs_document_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD CONSTRAINT "yjs_document_updates_document_id_yjs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."yjs_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD CONSTRAINT "yjs_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_plugin_idx" ON "project_data" USING btree ("project_id","plugin_id");--> statement-breakpoint
CREATE INDEX "project_plugin_key_idx" ON "project_data" USING btree ("project_id","plugin_id","key");--> statement-breakpoint
CREATE INDEX "slug_idx" ON "projects" USING btree ("slug");