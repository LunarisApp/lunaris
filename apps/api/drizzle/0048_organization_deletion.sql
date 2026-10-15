CREATE TABLE "organization_deletions" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"requested_by" text,
	"requested_at" timestamp NOT NULL,
	"purge_after" timestamp NOT NULL,
	"purge_started_at" timestamp,
	"billing_stopped_at" timestamp,
	"notified_at" timestamp,
	"reminder_sent_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_purge_after" timestamp;--> statement-breakpoint
CREATE INDEX "organization_deletions_due_idx" ON "organization_deletions" USING btree ("completed_at","purge_after");