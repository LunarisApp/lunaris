CREATE TYPE "public"."backup_notification_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('queued', 'processing', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "backup_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text,
	"status" "backup_status" DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"processed_files" integer DEFAULT 0 NOT NULL,
	"total_files" integer,
	"processed_bytes" bigint DEFAULT 0 NOT NULL,
	"total_bytes" bigint,
	"object_key" text,
	"filename" text,
	"archive_size_bytes" bigint,
	"failure_code" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp,
	"notification_status" "backup_notification_status" DEFAULT 'pending' NOT NULL,
	"notification_attempts" integer DEFAULT 0 NOT NULL,
	"notification_last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_exports" ADD CONSTRAINT "backup_exports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_exports" ADD CONSTRAINT "backup_exports_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_org_created_idx" ON "backup_exports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "backup_status_lease_idx" ON "backup_exports" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "backup_notification_idx" ON "backup_exports" USING btree ("notification_status","notification_last_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backup_one_active_uidx" ON "backup_exports" USING btree ("organization_id") WHERE "backup_exports"."status" IN ('queued', 'processing');