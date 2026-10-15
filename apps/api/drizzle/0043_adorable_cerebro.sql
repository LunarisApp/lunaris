DROP TRIGGER IF EXISTS "organization_install_default_excalidraw" ON "organization";--> statement-breakpoint
DROP FUNCTION IF EXISTS "install_default_excalidraw"();--> statement-breakpoint
ALTER TABLE "project_extensions" ADD COLUMN IF NOT EXISTS "registry_id" text;--> statement-breakpoint
ALTER TABLE "project_extensions" ADD COLUMN IF NOT EXISTS "version" text;--> statement-breakpoint
ALTER TABLE "project_extensions" ADD COLUMN IF NOT EXISTS "descriptor_url" text;--> statement-breakpoint
ALTER TABLE "project_extensions" ADD COLUMN IF NOT EXISTS "descriptor_bytes" integer;--> statement-breakpoint
ALTER TABLE "project_extensions" ADD COLUMN IF NOT EXISTS "descriptor_sha256" text;--> statement-breakpoint
DO $$
BEGIN
	IF to_regclass('public.workspace_plugins') IS NOT NULL THEN
		UPDATE "project_extensions" AS "project_extension"
		SET
			"registry_id" = "workspace_plugin"."registry_id",
			"version" = "workspace_plugin"."version",
			"descriptor_url" = "workspace_plugin"."descriptor_url",
			"descriptor_bytes" = "workspace_plugin"."descriptor_bytes",
			"descriptor_sha256" = "workspace_plugin"."descriptor_sha256",
			"updated_at" = now(),
			"synced_updated_at" = now()
		FROM "projects" AS "project", "workspace_plugins" AS "workspace_plugin"
		WHERE
			"project_extension"."project_id" = "project"."id"
			AND "project"."organization_id" = "workspace_plugin"."organization_id"
			AND "project_extension"."extension_id" = "workspace_plugin"."plugin_id"
			AND "project_extension"."enabled" = true;

		INSERT INTO "project_extensions" (
			"id", "project_id", "extension_id", "enabled", "registry_id", "version",
			"descriptor_url", "descriptor_bytes", "descriptor_sha256", "created_at",
			"updated_at", "synced_created_at", "synced_updated_at"
		)
		SELECT
			'project-extension:' || "project"."id" || ':' || "workspace_plugin"."plugin_id",
			"project"."id",
			"workspace_plugin"."plugin_id",
			true,
			"workspace_plugin"."registry_id",
			"workspace_plugin"."version",
			"workspace_plugin"."descriptor_url",
			"workspace_plugin"."descriptor_bytes",
			"workspace_plugin"."descriptor_sha256",
			now(),
			now(),
			now(),
			now()
		FROM "projects" AS "project"
		INNER JOIN "workspace_plugins" AS "workspace_plugin"
			ON "project"."organization_id" = "workspace_plugin"."organization_id"
		WHERE
			"workspace_plugin"."plugin_id" = 'lunaris.excalidraw'
			AND NOT EXISTS (
				SELECT 1
				FROM "project_extensions" AS "existing_extension"
				WHERE "existing_extension"."project_id" = "project"."id"
			)
		ON CONFLICT ("project_id", "extension_id") DO NOTHING;

		DROP TABLE "workspace_plugins" CASCADE;
	END IF;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "install_official_extension_registry"()
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
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "organization_install_official_extension_registry" ON "organization";--> statement-breakpoint
CREATE TRIGGER "organization_install_official_extension_registry"
AFTER INSERT ON "organization"
FOR EACH ROW EXECUTE FUNCTION "install_official_extension_registry"();
