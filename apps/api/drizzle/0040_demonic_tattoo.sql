CREATE TABLE "project_extensions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"extension_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"synced_created_at" timestamp DEFAULT now() NOT NULL,
	"synced_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_extensions_project_extension_unique" UNIQUE("project_id","extension_id")
);
--> statement-breakpoint
ALTER TABLE "project_extensions" ADD CONSTRAINT "project_extensions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_extensions_project_enabled_idx" ON "project_extensions" USING btree ("project_id","enabled");--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE project_extensions;--> statement-breakpoint
CREATE FUNCTION migration_0040_try_jsonb(value text) RETURNS jsonb AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint
WITH configurations AS (
  SELECT data.*, migration_0040_try_jsonb(data.value) AS enabled_plugins
  FROM project_data data
  WHERE data.plugin_id = 'system' AND data.key = 'enabled_plugins'
)
INSERT INTO project_extensions
  (id, project_id, extension_id, enabled, created_at, updated_at,
   synced_created_at, synced_updated_at)
SELECT
  'project-extension:' || data.project_id || ':' || (extension.value #>> '{}'),
  data.project_id, extension.value #>> '{}', true, data.created_at, data.updated_at,
  data.synced_created_at, data.synced_updated_at
FROM configurations data
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(data.enabled_plugins) = 'array' THEN data.enabled_plugins
    ELSE '[]'::jsonb
  END
) extension(value)
WHERE jsonb_typeof(data.enabled_plugins) = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(data.enabled_plugins) invalid_plugin(value)
    WHERE jsonb_typeof(invalid_plugin.value) <> 'string'
  )
  AND jsonb_typeof(extension.value) = 'string'
ON CONFLICT DO NOTHING;--> statement-breakpoint
WITH configurations AS (
  SELECT data.*, migration_0040_try_jsonb(data.value) AS enabled_plugins
  FROM project_data data
  WHERE data.plugin_id = 'system' AND data.key = 'enabled_plugins'
)
INSERT INTO project_extensions
  (id, project_id, extension_id, enabled, created_at, updated_at,
   synced_created_at, synced_updated_at)
SELECT
  'project-extension:' || data.project_id || ':lunaris.rich-text',
  data.project_id, 'lunaris.rich-text', false, data.created_at, data.updated_at,
  data.synced_created_at, data.synced_updated_at
FROM configurations data
WHERE jsonb_typeof(data.enabled_plugins) = 'array'
  AND jsonb_array_length(data.enabled_plugins) = 0
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP FUNCTION migration_0040_try_jsonb(text);
