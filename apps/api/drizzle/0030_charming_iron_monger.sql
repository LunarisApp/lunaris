ALTER TYPE "public"."project_visibility" ADD VALUE 'private' BEFORE 'local';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_org_owner_visibility_updated_idx" ON "projects" USING btree ("organization_id","owner_id","visibility","updated_at" DESC NULLS LAST,"id");
