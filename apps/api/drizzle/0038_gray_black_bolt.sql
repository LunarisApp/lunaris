CREATE TABLE "workspace_extension_registries" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"location" text NOT NULL,
	"manifest_url" text NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"added_by" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_extension_registries_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "workspace_extension_registries_org_location_unique" UNIQUE("organization_id","location")
);
--> statement-breakpoint
ALTER TABLE "workspace_extension_registries" ADD CONSTRAINT "workspace_extension_registries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_extension_registries" ADD CONSTRAINT "workspace_extension_registries_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_extension_registries_org_added_idx" ON "workspace_extension_registries" USING btree ("organization_id","added_at");
--> statement-breakpoint
INSERT INTO "workspace_extension_registries" (
	"id", "organization_id", "kind", "location", "manifest_url", "official"
)
SELECT
	'lunaris-official',
	"id",
	'github',
	'https://github.com/LunarisApp/extensions',
	'https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json',
	true
FROM "organization"
ON CONFLICT ("organization_id", "id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD COLUMN "registry_id" text DEFAULT 'lunaris-official' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD COLUMN "descriptor_url" text;
--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD COLUMN "descriptor_bytes" integer;
--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD COLUMN "descriptor_sha256" text;
--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD CONSTRAINT "workspace_plugins_registry_fk" FOREIGN KEY ("organization_id","registry_id") REFERENCES "public"."workspace_extension_registries"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
UPDATE "workspace_plugins"
SET "version" = '0.0.1', "updated_at" = now()
WHERE "plugin_id" = 'lunaris.excalidraw' AND "version" = '1.0.0';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "install_default_excalidraw"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	INSERT INTO public.workspace_extension_registries (
		id, organization_id, kind, location, manifest_url, official
	)
	VALUES (
		'lunaris-official',
		NEW.id,
		'github',
		'https://github.com/LunarisApp/extensions',
		'https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json',
		true
	)
	ON CONFLICT (organization_id, id) DO NOTHING;

	INSERT INTO public.workspace_plugins (
		organization_id, plugin_id, registry_id, version, installed_by
	)
	VALUES (NEW.id, 'lunaris.excalidraw', 'lunaris-official', '0.0.1', NULL)
	ON CONFLICT (organization_id, plugin_id) DO NOTHING;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE workspace_extension_registries;
