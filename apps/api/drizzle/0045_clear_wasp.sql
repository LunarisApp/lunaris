CREATE TABLE "project_resource_trash" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"trash_root_id" text NOT NULL,
	"trashed_at" timestamp NOT NULL,
	"purge_at" timestamp NOT NULL,
	"synced_created_at" timestamp DEFAULT now() NOT NULL,
	"synced_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_resource_trash_deadline_valid" CHECK ("project_resource_trash"."purge_at" > "project_resource_trash"."trashed_at")
);
--> statement-breakpoint
ALTER TABLE "project_resource_trash" ADD CONSTRAINT "project_resource_trash_id_project_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."project_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_trash" ADD CONSTRAINT "project_resource_trash_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prt_project_purge_idx" ON "project_resource_trash" USING btree ("project_id","purge_at");--> statement-breakpoint
CREATE INDEX "prt_project_root_idx" ON "project_resource_trash" USING btree ("project_id","trash_root_id");--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE project_resource_trash;
