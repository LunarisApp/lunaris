CREATE TABLE "agent_authorization" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"resource" text NOT NULL,
	"scopes" text[] NOT NULL,
	"organization_ids" text[] NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	"resources" text[],
	"oauth_client_id" text,
	CONSTRAINT "device_code_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "device_code_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
ALTER TABLE "agent_authorization" ADD CONSTRAINT "agent_authorization_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agentAuthorization_userId_idx" ON "agent_authorization" USING btree ("user_id");