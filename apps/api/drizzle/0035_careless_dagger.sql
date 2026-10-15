CREATE TABLE "workspace_plugins" (
	"organization_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"version" text NOT NULL,
	"installed_by" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_plugins_organization_id_plugin_id_pk" PRIMARY KEY("organization_id","plugin_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD CONSTRAINT "workspace_plugins_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD CONSTRAINT "workspace_plugins_installed_by_user_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_plugins_org_updated_idx" ON "workspace_plugins" USING btree ("organization_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE workspace_plugins;
