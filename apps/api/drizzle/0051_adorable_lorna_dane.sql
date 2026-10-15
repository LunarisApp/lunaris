CREATE TABLE "file_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text,
	"size_bytes" bigint NOT NULL,
	"state" text NOT NULL,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "file_object_size_valid" CHECK ("file_objects"."size_bytes" >= 0 AND "file_objects"."size_bytes" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "organization_storage" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enterprise_override_bytes" bigint,
	"inventory_completed_at" timestamp,
	"enforcement_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "storage_override_valid" CHECK ("organization_storage"."enterprise_override_bytes" >= 0 AND "organization_storage"."enterprise_override_bytes" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"file_id" text NOT NULL,
	"object_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"file_id" text NOT NULL,
	"replacement_file_id" text,
	"replacement_storage_id" text,
	"previous_object_key" text,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"reserved_bytes" bigint NOT NULL,
	"credit_bytes" bigint DEFAULT 0 NOT NULL,
	"part_size" integer DEFAULT 16777216 NOT NULL,
	"upload_id" text,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "file_upload_sessions_objectKey_unique" UNIQUE("object_key"),
	CONSTRAINT "upload_session_bytes_valid" CHECK ("file_upload_sessions"."size_bytes" >= 0 AND "file_upload_sessions"."size_bytes" <= 5000000000 AND "file_upload_sessions"."reserved_bytes" >= 0 AND "file_upload_sessions"."credit_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_object_key_file_objects_key_fk" FOREIGN KEY ("object_key") REFERENCES "public"."file_objects"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_objects_organization_idx" ON "file_objects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "file_objects_cleanup_idx" ON "file_objects" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_identity_unique" ON "stored_files" USING btree ("organization_id","workspace_id","file_id");--> statement-breakpoint
CREATE INDEX "stored_files_object_idx" ON "stored_files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "upload_sessions_organization_idx" ON "file_upload_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_reconcile_idx" ON "file_upload_sessions" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_active_file_unique" ON "file_upload_sessions" USING btree ("organization_id","workspace_id","file_id") WHERE "file_upload_sessions"."state" NOT IN ('completed', 'canceled');--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_active_replacement_unique" ON "file_upload_sessions" USING btree ("organization_id","workspace_id","replacement_file_id") WHERE "file_upload_sessions"."state" NOT IN ('completed', 'canceled');