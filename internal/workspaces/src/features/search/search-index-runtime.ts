import {
  matchesResourceTarget,
  type RegisteredSearchIndexer,
  type ResourceEnvelope,
  type ResourceStorageHandles,
  type ResourceTypeContribution,
} from "@lunarisapp/plugin-sdk";
import { type DatabaseOrTx, ensureTx } from "@repo/data/core";
import {
  type AttachmentRowWithValue,
  parseAttachmentMetadata,
  readAttachmentFile,
} from "@repo/data/features/attachments";
import {
  buildFileAttachmentQuery,
  type FileMetadata,
  getFileMediaType,
} from "@repo/data/features/files";
import {
  getStorageSlot,
  hydrateResourceStorage,
} from "@repo/data/features/workspace-storage-slots";
import {
  searchIndexEntryKey,
  upsertSearchIndexEntry,
} from "@repo/data/features/search-index";

export interface IndexableResourceRow {
  file_pending_count: number;
  id: string;
  parent_id: string | null;
  resource_type_id: string | null;
  schema_version: number | null;
  storage_count: number;
  storage_latest: string | null;
  updated_at: string | null;
  value_count: number;
  value_latest: string | null;
  workspace_id: string;
  yjs_count: number;
  yjs_latest: string | null;
  yjs_slot_count: number;
}

export interface SearchIndexJob {
  definition: ResourceTypeContribution;
  entryKey: string;
  indexer: RegisteredSearchIndexer;
  resource: ResourceEnvelope;
  revision: string;
  row: IndexableResourceRow;
}

export interface SearchIndexSourceState {
  available: boolean;
  revision: string;
}

export const INDEXABLE_RESOURCES_QUERY = `
  WITH resources AS (
    SELECT resources.* FROM workspace_resources resources
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_resource_trash trash WHERE trash.id = resources.id
    )
    UNION ALL
    SELECT resources.* FROM local_workspace_resources resources
    WHERE NOT EXISTS (
      SELECT 1 FROM local_workspace_resource_trash trash WHERE trash.id = resources.id
    )
  ), workspaces_union AS (
    SELECT * FROM workspaces
    UNION ALL
    SELECT * FROM local_workspaces
  ), updates AS (
    SELECT document_id, COUNT(*) AS yjs_count,
      MAX(created_at || ':' || id) AS yjs_latest
    FROM (
      SELECT id, document_id, created_at FROM yjs_document_updates
      UNION ALL
      SELECT id, document_id, created_at FROM local_yjs_document_updates
    )
    GROUP BY document_id
  ), slots AS (
    SELECT * FROM workspace_storage_slots
    UNION ALL
    SELECT * FROM local_workspace_storage_slots
  ), storage_values AS (
    SELECT * FROM workspace_storage_values
    UNION ALL
    SELECT * FROM local_workspace_storage_values
  ), value_revisions AS (
    SELECT storage_id, COUNT(*) AS value_count,
      MAX(updated_at || ':' || id) AS value_latest
    FROM storage_values
    GROUP BY storage_id
  ), storage_state AS (
    SELECT slots.resource_id,
      COUNT(*) AS storage_count,
      SUM(COALESCE(value_revisions.value_count, 0)) AS value_count,
      MAX(value_revisions.value_latest) AS value_latest,
      SUM(CASE WHEN slots.kind = 'yjs' THEN 1 ELSE 0 END) AS yjs_slot_count,
      SUM(COALESCE(updates.yjs_count, 0)) AS yjs_count,
      MAX(updates.yjs_latest) AS yjs_latest,
      SUM(CASE
        WHEN slots.kind = 'file' AND slots.metadata IS NOT NULL
          AND a.local_uri IS NULL THEN 1
        ELSE 0
      END) AS file_pending_count,
      MAX(slots.updated_at) AS storage_latest
    FROM slots
    LEFT JOIN updates ON updates.document_id = slots.backing_id
    LEFT JOIN value_revisions ON value_revisions.storage_id = slots.id
    LEFT JOIN attachments a ON a.id = CASE
      WHEN json_valid(slots.metadata) THEN COALESCE(
        json_extract(slots.metadata, '$.attachmentId'),
        json_extract(slots.metadata, '$.fileId')
      )
      ELSE NULL
    END
    WHERE slots.resource_id IS NOT NULL
    GROUP BY slots.resource_id
  )
  SELECT resources.id, resources.workspace_id, resources.parent_id,
    resources.resource_type_id, resources.schema_version, resources.updated_at,
    COALESCE(storage_state.storage_count, 0) AS storage_count,
    COALESCE(storage_state.value_count, 0) AS value_count,
    storage_state.value_latest,
    COALESCE(storage_state.yjs_slot_count, 0) AS yjs_slot_count,
    COALESCE(storage_state.yjs_count, 0) AS yjs_count,
    storage_state.yjs_latest,
    COALESCE(storage_state.file_pending_count, 0) AS file_pending_count,
    storage_state.storage_latest
  FROM resources
  INNER JOIN workspaces_union ON workspaces_union.id = resources.workspace_id
  LEFT JOIN storage_state ON storage_state.resource_id = resources.id
  WHERE workspaces_union.organization_id = ?
`;

const CURRENT_INDEXABLE_RESOURCE_QUERY = `${INDEXABLE_RESOURCES_QUERY.trim()}
  AND resources.id = ?
  LIMIT 1
`;

function sourceRevision(
  row: IndexableResourceRow,
  indexer: RegisteredSearchIndexer
): string {
  return JSON.stringify([
    indexer.extensionId,
    indexer.extensionVersion,
    indexer.definition.id,
    row.schema_version ?? 1,
    row.updated_at ?? "",
    row.yjs_count,
    row.yjs_latest ?? "",
    row.storage_count,
    row.storage_latest ?? "",
    row.value_count,
    row.value_latest ?? "",
    row.file_pending_count,
  ]);
}

function isContentAvailable(
  row: IndexableResourceRow,
  definition: ResourceTypeContribution
): boolean {
  const expectedSlots = Object.values(definition.storage);
  const expectedYjsSlots = expectedSlots.filter(
    (slot) => slot.kind === "yjs"
  ).length;
  return (
    row.storage_count >= expectedSlots.length &&
    row.yjs_slot_count >= expectedYjsSlots &&
    row.yjs_count >= expectedYjsSlots &&
    row.file_pending_count === 0
  );
}

function getSourceState(
  row: IndexableResourceRow,
  definition: ResourceTypeContribution,
  indexer: RegisteredSearchIndexer
): SearchIndexSourceState {
  return {
    available: isContentAvailable(row, definition),
    revision: sourceRevision(row, indexer),
  };
}

export function planSearchIndexUpdates(
  rows: IndexableResourceRow[],
  definitions: ReadonlyMap<string, ResourceTypeContribution>,
  indexers: RegisteredSearchIndexer[],
  revisions: ReadonlyMap<string, string>
): {
  activeEntryKeys: Set<string>;
  entryStates: Map<string, SearchIndexSourceState>;
  jobs: SearchIndexJob[];
} {
  const activeEntryKeys = new Set<string>();
  const entryStates = new Map<string, SearchIndexSourceState>();
  const jobs: SearchIndexJob[] = [];

  for (const row of rows) {
    const resourceTypeId = row.resource_type_id ?? "lunaris.folder";
    const definition = definitions.get(resourceTypeId);
    if (!definition) {
      continue;
    }
    const resource: ResourceEnvelope = {
      parentId: row.parent_id,
      resourceId: row.id,
      resourceTypeId,
      schemaId: definition.schema.id,
      schemaVersion: row.schema_version ?? 1,
    };

    for (const indexer of indexers) {
      if (!matchesResourceTarget(indexer.definition, resource)) {
        continue;
      }
      const entryKey = searchIndexEntryKey(indexer.definition.id, row.id);
      const state = getSourceState(row, definition, indexer);
      activeEntryKeys.add(entryKey);
      entryStates.set(entryKey, state);
      if (revisions.get(entryKey) === state.revision) {
        continue;
      }
      if (!state.available) {
        continue;
      }
      jobs.push({
        definition,
        entryKey,
        indexer,
        resource,
        revision: state.revision,
        row,
      });
    }
  }

  return { activeEntryKeys, entryStates, jobs };
}

async function readCurrentSourceState(
  db: DatabaseOrTx,
  organizationId: string,
  job: SearchIndexJob
): Promise<SearchIndexSourceState | null> {
  const row = await db.getOptional<IndexableResourceRow>(
    CURRENT_INDEXABLE_RESOURCE_QUERY,
    [organizationId, job.row.id]
  );
  return row ? getSourceState(row, job.definition, job.indexer) : null;
}

async function readIndexFile(
  db: DatabaseOrTx,
  workspaceId: string,
  resourceId: string,
  storageId: string
) {
  const slot = await getStorageSlot(db, storageId);
  if (
    !slot ||
    slot.workspace_id !== workspaceId ||
    slot.resource_id !== resourceId ||
    slot.kind !== "file"
  ) {
    throw new Error("Invalid file storage handle");
  }
  const { query, params } = buildFileAttachmentQuery(resourceId, storageId);
  const row = await db.getOptional<AttachmentRowWithValue>(query, params);
  const metadata = parseAttachmentMetadata<FileMetadata>(row?.value);
  if (!row?.local_uri) {
    return null;
  }
  // Indexers consume buffers. Keep background indexing from allocating a large
  // upload in memory; these resources remain searchable by their names.
  if ((metadata?.size ?? 0) > 25_000_000) {
    return null;
  }
  const mediaType = getFileMediaType(
    metadata?.mediaType ?? row.media_type ?? "",
    metadata?.filename ?? `file.${metadata?.fileExtension ?? "bin"}`
  );
  return {
    bytes: await readAttachmentFile({
      localUri: row.local_uri,
      mediaType,
      workspaceId,
    }),
    mediaType,
  };
}

async function readPayload(
  db: DatabaseOrTx,
  job: SearchIndexJob
): Promise<{ payload: unknown; storage: ResourceStorageHandles }> {
  const { definition, resource, row } = job;
  const hydrated = await hydrateResourceStorage(db, resource.resourceId);
  try {
    const payload = await definition.schema.read({
      resourceId: row.id,
      storage: hydrated.storage,
    });
    const validator = definition.schema.versions[resource.schemaVersion];
    if (!validator) {
      throw new Error("Resource schema version is unavailable");
    }
    const validation = await validator["~standard"].validate(payload);
    if (validation.issues) {
      throw new Error("Resource payload failed validation");
    }
    return { payload: validation.value, storage: hydrated.handles };
  } finally {
    hydrated.dispose();
  }
}

export async function runSearchIndexJob(input: {
  db: DatabaseOrTx;
  isCurrent(): boolean;
  job: SearchIndexJob;
  organizationId: string;
}): Promise<void> {
  const { db, isCurrent, job, organizationId } = input;
  if (!isCurrent()) {
    return;
  }
  const { payload, storage } = await readPayload(db, job);
  const text = (
    await job.indexer.definition.extractText(
      { payload, resource: job.resource, storage },
      {
        readFile: (handle) =>
          readIndexFile(db, job.row.workspace_id, job.row.id, handle.storageId),
      }
    )
  )?.trim();
  if (!isCurrent()) {
    return;
  }
  await ensureTx(db, async (tx) => {
    const currentSource = await readCurrentSourceState(tx, organizationId, job);
    if (
      !(isCurrent() && currentSource?.available) ||
      currentSource.revision !== job.revision
    ) {
      return;
    }
    await upsertSearchIndexEntry(tx, {
      content: text ?? "",
      entryKey: job.entryKey,
      indexedAt: new Date().toISOString(),
      indexerId: job.indexer.definition.id,
      workspaceId: job.row.workspace_id,
      resourceId: job.row.id,
      resourceTypeId: job.resource.resourceTypeId,
      sourceRevision: job.revision,
      organizationId,
    });
  });
}
