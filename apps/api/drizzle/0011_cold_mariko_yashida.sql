ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_unique";--> statement-breakpoint
DROP INDEX "slug_idx";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_slug_unique" UNIQUE("organization_id","slug");