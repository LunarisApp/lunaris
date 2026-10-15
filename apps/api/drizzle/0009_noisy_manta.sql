CREATE TABLE "project_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"parent_id" text,
	"document_id" text,
	"plugin_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"synced_created_at" timestamp DEFAULT now() NOT NULL,
	"synced_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_parent_id_project_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pi_project_parent_idx" ON "project_items" USING btree ("project_id","parent_id");--> statement-breakpoint
CREATE INDEX "pi_project_document_idx" ON "project_items" USING btree ("project_id","document_id");--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE project_items;