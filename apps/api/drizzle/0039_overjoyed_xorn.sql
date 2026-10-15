CREATE TABLE "project_storage_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"resource_id" text,
	"plugin_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"backing_id" text,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"synced_created_at" timestamp DEFAULT now() NOT NULL,
	"synced_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_storage_slots_scope_check" CHECK (("project_storage_slots"."resource_id" IS NOT NULL AND "project_storage_slots"."plugin_id" IS NULL) OR ("project_storage_slots"."resource_id" IS NULL AND "project_storage_slots"."plugin_id" IS NOT NULL)),
	CONSTRAINT "project_storage_slots_kind_check" CHECK ("project_storage_slots"."kind" IN ('file', 'key-value', 'yjs'))
);
--> statement-breakpoint
CREATE TABLE "project_storage_values" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_id" text NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"synced_created_at" timestamp DEFAULT now() NOT NULL,
	"synced_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_storage_values_storage_key_unique" UNIQUE("storage_id","key")
);
--> statement-breakpoint
ALTER TABLE "project_storage_slots" ADD CONSTRAINT "project_storage_slots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_storage_slots" ADD CONSTRAINT "project_storage_slots_resource_id_project_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."project_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_storage_values" ADD CONSTRAINT "project_storage_values_storage_id_project_storage_slots_id_fk" FOREIGN KEY ("storage_id") REFERENCES "public"."project_storage_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_storage_values" ADD CONSTRAINT "project_storage_values_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_storage_slots_resource_name_unique" ON "project_storage_slots" USING btree ("resource_id","name") WHERE "project_storage_slots"."resource_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_storage_slots_project_plugin_name_unique" ON "project_storage_slots" USING btree ("project_id","plugin_id","name") WHERE "project_storage_slots"."resource_id" IS NULL;--> statement-breakpoint
CREATE INDEX "project_storage_slots_project_idx" ON "project_storage_slots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_storage_slots_resource_idx" ON "project_storage_slots" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "project_storage_values_project_idx" ON "project_storage_values" USING btree ("project_id");--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE project_storage_slots, project_storage_values;--> statement-breakpoint
INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT
  'storage_legacy_' || resource.id || '_content', resource.project_id, resource.id,
  NULL, 'content', 'file', metadata.value::jsonb->>'attachmentId',
  (metadata.value::jsonb || jsonb_build_object('fileId', metadata.value::jsonb->>'attachmentId'))::text,
  resource.created_at, resource.updated_at
FROM project_resources resource
JOIN project_data metadata
  ON metadata.project_id = resource.project_id
 AND metadata.plugin_id = resource.resource_type_id
 AND metadata.key = 'file:' || resource.id
ON CONFLICT DO NOTHING;--> statement-breakpoint
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
    SELECT 1
    FROM project_data metadata
    WHERE metadata.project_id = resource.project_id
      AND metadata.plugin_id = resource.resource_type_id
      AND metadata.key = 'file:' || resource.id
  )
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT
  'storage_legacy_' || id || '_state', project_id, id, NULL, 'state', 'key-value',
  NULL, NULL, created_at, updated_at
FROM project_resources
WHERE resource_type_id = 'lunaris.compiler'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO project_storage_values
  (id, storage_id, project_id, key, value, created_at, updated_at)
SELECT
  'storage_value_' || md5(data.id || ':' || data.key),
  'storage_legacy_' || resource.id || '_state', data.project_id,
  CASE WHEN data.key LIKE 'selected-documents:%' THEN 'selection' ELSE 'theme' END,
  data.value, data.created_at, data.updated_at
FROM project_data data
JOIN project_resources resource
  ON resource.project_id = data.project_id
 AND resource.resource_type_id = 'lunaris.compiler'
 AND data.key IN (
   'selected-documents:' || resource.document_id,
   'pdf-theme:' || resource.document_id
 )
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO project_storage_slots
  (id, project_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
SELECT
  'storage_project_' || md5(data.project_id || ':' || data.plugin_id),
  data.project_id, NULL, data.plugin_id, data.plugin_id, 'key-value',
  NULL, NULL, MIN(data.created_at), MAX(data.updated_at)
FROM project_data data
WHERE data.plugin_id <> 'system'
  AND NOT (data.plugin_id = 'lunaris.compiler' AND (data.key LIKE 'selected-documents:%' OR data.key LIKE 'pdf-theme:%'))
  AND NOT EXISTS (
    SELECT 1
    FROM project_resources resource
    WHERE resource.project_id = data.project_id
      AND resource.resource_type_id = data.plugin_id
      AND data.key = 'file:' || resource.id
  )
GROUP BY data.project_id, data.plugin_id
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO project_storage_values
  (id, storage_id, project_id, key, value, created_at, updated_at)
SELECT
  'storage_value_' || md5(data.id),
  'storage_project_' || md5(data.project_id || ':' || data.plugin_id),
  data.project_id,
  COALESCE(resource.id || substr(data.key, length(resource.document_id) + 1), data.key),
  data.value, data.created_at, data.updated_at
FROM project_data data
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
  AND NOT (data.plugin_id = 'lunaris.compiler' AND (data.key LIKE 'selected-documents:%' OR data.key LIKE 'pdf-theme:%'))
  AND NOT EXISTS (
    SELECT 1
    FROM project_resources file_resource
    WHERE file_resource.project_id = data.project_id
      AND file_resource.resource_type_id = data.plugin_id
      AND data.key = 'file:' || file_resource.id
  )
ON CONFLICT DO NOTHING;
