CREATE FUNCTION migration_0042_try_jsonb(value text) RETURNS jsonb AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM project_data
    WHERE migration_0042_try_jsonb(value) IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: malformed project_data JSON';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_data
    WHERE plugin_id = 'system'
      AND key <> 'enabled_plugins'
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: unclassified system project_data rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_data
    WHERE plugin_id = 'system' AND key = 'enabled_plugins'
      AND jsonb_typeof(migration_0042_try_jsonb(value)) <> 'array'
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: malformed enabled_plugins data';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_data data
    WHERE data.plugin_id = 'system' AND data.key = 'enabled_plugins'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(migration_0042_try_jsonb(data.value)) item
        WHERE jsonb_typeof(item) <> 'string'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: enabled_plugins contains a non-string value';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM project_data data
    JOIN project_resources resource
      ON resource.project_id = data.project_id
     AND resource.resource_type_id = data.plugin_id
     AND data.key = 'file:' || resource.id
    WHERE migration_0042_try_jsonb(data.value) IS NULL
       OR migration_0042_try_jsonb(data.value)->>'attachmentId' IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: malformed file metadata';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM project_data data
    JOIN project_resources resource
      ON resource.project_id = data.project_id
     AND resource.resource_type_id = data.plugin_id
     AND data.key = 'file:' || resource.id
    WHERE resource.document_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: resource has both Yjs and file content';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM project_data data
    JOIN project_resources resource
      ON resource.project_id = data.project_id
     AND resource.resource_type_id = data.plugin_id
     AND data.key = 'file:' || resource.id
    JOIN project_storage_slots slot
      ON slot.resource_id = resource.id AND slot.name = 'content'
    WHERE slot.kind <> 'file'
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: file metadata conflicts with canonical content storage';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM project_resources resource
    JOIN project_storage_slots slot
      ON slot.resource_id = resource.id AND slot.name = 'content'
    WHERE resource.document_id IS NOT NULL
      AND resource.resource_type_id <> 'lunaris.compiler'
      AND (slot.kind <> 'yjs' OR slot.backing_id IS DISTINCT FROM resource.document_id)
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: resource document conflicts with content storage';
  END IF;
END $$;--> statement-breakpoint

CREATE TABLE legacy_orphan_project_data (
  id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  plugin_id text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  reason text NOT NULL,
  created_at timestamp NOT NULL,
  updated_at timestamp NOT NULL,
  synced_created_at timestamp NOT NULL,
  synced_updated_at timestamp NOT NULL,
  archived_at timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

INSERT INTO legacy_orphan_project_data
  (id, project_id, plugin_id, key, value, reason, created_at, updated_at, synced_created_at, synced_updated_at)
SELECT
  data.id, data.project_id, data.plugin_id, data.key, data.value,
  'file_resource_missing', data.created_at, data.updated_at,
  data.synced_created_at, data.synced_updated_at
FROM project_data data
WHERE data.plugin_id <> 'system'
  AND data.key LIKE 'file:%'
  AND NOT EXISTS (
    SELECT 1 FROM project_resources resource
    WHERE resource.project_id = data.project_id
      AND resource.resource_type_id = data.plugin_id
      AND data.key = 'file:' || resource.id
  )
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO legacy_orphan_project_data
  (id, project_id, plugin_id, key, value, reason, created_at, updated_at, synced_created_at, synced_updated_at)
SELECT
  data.id, data.project_id, data.plugin_id, data.key, data.value,
  'compiler_resource_missing', data.created_at, data.updated_at,
  data.synced_created_at, data.synced_updated_at
FROM project_data data
WHERE data.plugin_id = 'lunaris.compiler'
  AND (data.key LIKE 'selected-documents:%' OR data.key LIKE 'pdf-theme:%')
  AND (
    SELECT count(*) FROM project_resources resource
    WHERE resource.project_id = data.project_id
      AND resource.resource_type_id = 'lunaris.compiler'
      AND data.key IN (
        'selected-documents:' || resource.document_id,
        'pdf-theme:' || resource.document_id
      )
  ) <> 1
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT DISTINCT
  'storage_legacy_' || resource.id || '_content', resource.project_id, resource.id,
  NULL, 'content', 'file', data.value::jsonb->>'attachmentId',
  (data.value::jsonb || jsonb_build_object('fileId', data.value::jsonb->>'attachmentId'))::text,
  resource.created_at, GREATEST(resource.updated_at, data.updated_at)
FROM project_resources resource
JOIN project_data data
  ON data.project_id = resource.project_id
 AND data.plugin_id = resource.resource_type_id
 AND data.key = 'file:' || resource.id
ON CONFLICT DO NOTHING;--> statement-breakpoint

UPDATE project_storage_slots slot
SET backing_id = data.value::jsonb->>'attachmentId',
    metadata = (data.value::jsonb || jsonb_build_object('fileId', data.value::jsonb->>'attachmentId'))::text,
    updated_at = data.updated_at,
    synced_updated_at = now()
FROM project_resources resource, project_data data
WHERE slot.resource_id = resource.id
  AND slot.name = 'content'
  AND slot.kind = 'file'
  AND data.project_id = resource.project_id
  AND data.plugin_id = resource.resource_type_id
  AND data.key = 'file:' || resource.id
  AND data.updated_at > slot.updated_at;--> statement-breakpoint

INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT
  'storage_legacy_' || resource.id || '_content', resource.project_id, resource.id,
  NULL, 'content', 'yjs', resource.document_id, NULL,
  resource.created_at, resource.updated_at
FROM project_resources resource
WHERE resource.document_id IS NOT NULL
  AND resource.resource_type_id <> 'lunaris.compiler'
  AND NOT EXISTS (
    SELECT 1 FROM project_data data
    WHERE data.project_id = resource.project_id
      AND data.plugin_id = resource.resource_type_id
      AND data.key = 'file:' || resource.id
  )
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT
  'storage_legacy_' || id || '_state', project_id, id, NULL,
  'state', 'key-value', NULL, NULL, created_at, updated_at
FROM project_resources
WHERE resource_type_id = 'lunaris.compiler'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO project_storage_values
  (id, storage_id, project_id, key, value, created_at, updated_at)
SELECT
  'storage_value_' || md5(data.id || ':' || data.key), slot.id, data.project_id,
  CASE WHEN data.key LIKE 'selected-documents:%' THEN 'selection' ELSE 'theme' END,
  data.value, data.created_at, data.updated_at
FROM project_data data
JOIN project_resources resource
  ON resource.project_id = data.project_id
 AND resource.resource_type_id = 'lunaris.compiler'
 AND data.key IN ('selected-documents:' || resource.document_id, 'pdf-theme:' || resource.document_id)
JOIN project_storage_slots slot
  ON slot.resource_id = resource.id AND slot.name = 'state' AND slot.kind = 'key-value'
ON CONFLICT (storage_id, key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at,
    synced_updated_at = now()
WHERE EXCLUDED.updated_at > project_storage_values.updated_at;--> statement-breakpoint

INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT
  'storage_project_' || md5(data.project_id || ':' || data.plugin_id),
  data.project_id, NULL, data.plugin_id, data.plugin_id, 'key-value',
  NULL, NULL, MIN(data.created_at), MAX(data.updated_at)
FROM project_data data
WHERE data.plugin_id <> 'system'
  AND data.key NOT LIKE 'file:%'
  AND NOT (data.plugin_id = 'lunaris.compiler' AND (data.key LIKE 'selected-documents:%' OR data.key LIKE 'pdf-theme:%'))
  AND NOT EXISTS (
    SELECT 1 FROM project_resources resource
    WHERE resource.project_id = data.project_id
      AND resource.resource_type_id = data.plugin_id
      AND data.key = 'file:' || resource.id
  )
GROUP BY data.project_id, data.plugin_id
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO project_storage_values
  (id, storage_id, project_id, key, value, created_at, updated_at)
SELECT
  'storage_value_' || md5(data.id), slot.id, data.project_id,
  COALESCE(resource.id || substr(data.key, length(resource.document_id) + 1), data.key),
  data.value, data.created_at, data.updated_at
FROM project_data data
JOIN project_storage_slots slot
  ON slot.project_id = data.project_id
 AND slot.plugin_id = data.plugin_id
 AND slot.resource_id IS NULL
 AND slot.kind = 'key-value'
LEFT JOIN LATERAL (
  SELECT id, document_id
  FROM project_resources candidate
  WHERE candidate.project_id = data.project_id
    AND candidate.document_id IS NOT NULL
    AND data.key LIKE candidate.document_id || '%'
  ORDER BY length(candidate.document_id) DESC
  LIMIT 1
) resource ON true
WHERE data.plugin_id <> 'system'
  AND data.key NOT LIKE 'file:%'
  AND NOT (data.plugin_id = 'lunaris.compiler' AND (data.key LIKE 'selected-documents:%' OR data.key LIKE 'pdf-theme:%'))
  AND NOT EXISTS (
    SELECT 1 FROM project_resources file_resource
    WHERE file_resource.project_id = data.project_id
      AND file_resource.resource_type_id = data.plugin_id
      AND data.key = 'file:' || file_resource.id
  )
ON CONFLICT (storage_id, key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at,
    synced_updated_at = now()
WHERE EXCLUDED.updated_at > project_storage_values.updated_at;--> statement-breakpoint

CREATE TEMP TABLE migration_0042_newer_enabled_plugins ON COMMIT DROP AS
WITH configurations AS (
  SELECT data.*, migration_0042_try_jsonb(data.value) AS enabled_plugins,
    COALESCE((SELECT MAX(extension.updated_at) FROM project_extensions extension WHERE extension.project_id = data.project_id), '-infinity'::timestamp) AS canonical_updated_at
  FROM project_data data
  WHERE data.plugin_id = 'system' AND data.key = 'enabled_plugins'
)
SELECT * FROM configurations WHERE updated_at > canonical_updated_at;--> statement-breakpoint

UPDATE project_extensions extension
SET enabled = false,
    updated_at = newer.updated_at,
    synced_updated_at = now()
FROM migration_0042_newer_enabled_plugins newer
WHERE extension.project_id = newer.project_id;--> statement-breakpoint

INSERT INTO project_extensions
  (id, project_id, extension_id, enabled, created_at, updated_at, synced_created_at, synced_updated_at)
SELECT DISTINCT
  'project-extension:' || newer.project_id || ':' || (item #>> '{}'),
  newer.project_id, item #>> '{}', true, newer.created_at, newer.updated_at,
  newer.synced_created_at, now()
FROM migration_0042_newer_enabled_plugins newer
CROSS JOIN LATERAL jsonb_array_elements(newer.enabled_plugins) item
ON CONFLICT (project_id, extension_id) DO UPDATE
SET enabled = true,
    updated_at = EXCLUDED.updated_at,
    synced_updated_at = now();--> statement-breakpoint

DROP TABLE migration_0042_newer_enabled_plugins;--> statement-breakpoint

DO $$
DECLARE
  orphan_files bigint;
  orphan_yjs bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM project_storage_slots slot
    JOIN project_resources resource ON resource.id = slot.resource_id
    WHERE slot.project_id <> resource.project_id
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: cross-project resource storage';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_storage_values value
    JOIN project_storage_slots slot ON slot.id = value.storage_id
    WHERE value.project_id <> slot.project_id
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: cross-project storage value';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_storage_slots
    WHERE (kind = 'key-value' AND backing_id IS NOT NULL)
       OR (kind IN ('file', 'yjs') AND backing_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: invalid storage backing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_storage_slots slot
    LEFT JOIN yjs_documents document
      ON document.id = slot.backing_id AND document.project_id = slot.project_id
    WHERE slot.kind = 'yjs' AND document.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: Yjs storage backing is missing or belongs to another project';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project_resources resource
    WHERE resource.document_id IS NOT NULL
      AND resource.resource_type_id <> 'lunaris.compiler'
      AND NOT EXISTS (
        SELECT 1 FROM project_storage_slots slot
        WHERE slot.resource_id = resource.id AND slot.name = 'content'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy cleanup blocked: resource document was not migrated';
  END IF;
  SELECT count(*) INTO orphan_yjs
  FROM yjs_documents document
  WHERE NOT EXISTS (
    SELECT 1 FROM project_storage_slots slot
    WHERE slot.kind = 'yjs' AND slot.backing_id = document.id
  );
  SELECT count(*) INTO orphan_files FROM legacy_orphan_project_data;
  RAISE NOTICE 'Legacy cleanup: % orphan project_data rows archived for later recovery or GC', orphan_files;
  RAISE NOTICE 'Legacy cleanup: % unreferenced Yjs documents retained for later GC', orphan_yjs;
END $$;--> statement-breakpoint

DROP FUNCTION migration_0042_try_jsonb(text);--> statement-breakpoint
ALTER PUBLICATION powersync DROP TABLE project_data;--> statement-breakpoint
DROP TABLE project_data;--> statement-breakpoint
DROP INDEX pr_project_document_idx;--> statement-breakpoint
ALTER TABLE project_resources DROP COLUMN document_id;--> statement-breakpoint
ALTER TABLE project_resources ADD CONSTRAINT project_resources_id_project_unique UNIQUE(id, project_id);--> statement-breakpoint
ALTER TABLE project_storage_slots ADD CONSTRAINT project_storage_slots_id_project_unique UNIQUE(id, project_id);--> statement-breakpoint
ALTER TABLE project_storage_slots ADD CONSTRAINT project_storage_slots_resource_project_fk
  FOREIGN KEY (resource_id, project_id) REFERENCES project_resources(id, project_id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE project_storage_values ADD CONSTRAINT project_storage_values_storage_project_fk
  FOREIGN KEY (storage_id, project_id) REFERENCES project_storage_slots(id, project_id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE project_storage_slots ADD CONSTRAINT project_storage_slots_backing_check
  CHECK ((kind = 'key-value' AND backing_id IS NULL) OR (kind IN ('file', 'yjs') AND backing_id IS NOT NULL));
