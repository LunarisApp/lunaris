DROP TABLE "subscription";--> statement-breakpoint
CREATE TABLE "subscription" (
	"polar_subscription_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purchased_by_user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"plan_slug" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"modified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_purchased_by_user_id_user_id_fk" FOREIGN KEY ("purchased_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_organization_status_idx" ON "subscription" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_one_access_plan_per_workspace_idx" ON "subscription" USING btree ("organization_id") WHERE "subscription"."status" IN ('active', 'trialing');
