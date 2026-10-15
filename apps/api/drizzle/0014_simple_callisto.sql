CREATE TYPE "public"."project_visibility" AS ENUM('shared', 'local');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "visibility" "project_visibility" DEFAULT 'shared' NOT NULL;