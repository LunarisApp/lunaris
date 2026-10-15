import {
  resolveResource,
  type ResourceEnvelope,
  type ResourcePayloadStorage,
  type ResourceResolution,
  type ResourceTypeDefinition,
} from "@lunarisapp/plugin-sdk";
import type { DatabaseOrTx } from "@repo/data/core";
import {
  hydrateResourceStorage,
  resolveWorkspaceScopedTables,
} from "@repo/data/features/workspace-storage-slots";
import {
  compareAndSetWorkspaceResourceVersion,
  getWorkspaceResource,
} from "@repo/data/features/workspace-resources";
import { resolveWorkspaceVisibility } from "@repo/data/features/workspaces";
import {
  insertYjsDocumentUpdate,
  PERSISTED_YJS_UPDATE_ORIGIN,
  Uint8ArrayTob64,
} from "@repo/data/features/yjs";
import { createId } from "@repo/utils";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
  encodeStateVector,
} from "yjs";

async function initializeMissingStorage(params: {
  definition: ResourceTypeDefinition;
  envelope: ResourceEnvelope;
  resource: Awaited<ReturnType<typeof getWorkspaceResource>>;
  storage: Record<string, ResourcePayloadStorage>;
}): Promise<() => void> {
  const { definition, envelope, resource, storage } = params;
  const documents: Doc[] = [];
  try {
    for (const [name, slot] of Object.entries(definition.storage)) {
      if (storage[name]) continue;
      const context = {
        createdAt: resource?.created_at ?? new Date().toISOString(),
        parentId: envelope.parentId,
        resourceId: envelope.resourceId,
        userId: null,
      };
      if (slot.kind === "file") {
        storage[name] = { kind: "file", metadata: null };
      } else if (slot.kind === "key-value") {
        storage[name] = {
          kind: "key-value",
          values: slot.initialize ? await slot.initialize(context) : {},
        };
      } else {
        const document = new Doc();
        documents.push(document);
        await slot.initialize?.(document, context);
        storage[name] = { document, kind: "yjs" };
      }
    }
  } catch (error) {
    for (const document of documents) document.destroy();
    throw error;
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const document of documents) document.destroy();
  };
}

export async function resolveHostResource(params: {
  db: DatabaseOrTx;
  definition: ResourceTypeDefinition;
  envelope: ResourceEnvelope;
  workspaceId: string;
}): Promise<ResourceResolution> {
  const { db, definition, envelope, workspaceId } = params;
  const persistedResource = await getWorkspaceResource({
    db,
    id: envelope.resourceId,
  });
  let storage: Record<string, ResourcePayloadStorage> = {};
  let disposeStorage: () => void = () => undefined;
  let disposeInitializedStorage: () => void = () => undefined;
  try {
    const hydrated = await hydrateResourceStorage(db, envelope.resourceId, {
      sharedYjsWorkspaceId: workspaceId,
    });
    disposeStorage = hydrated.dispose;
    storage = hydrated.storage;
    const persistedSlots = hydrated.slots;
    for (const slot of persistedSlots) {
      if (slot.name && definition.storage[slot.name] &&
        definition.storage[slot.name]?.kind !== slot.kind) {
        throw new Error(`Storage slot ${slot.name} changed kind`);
      }
    }
    const missing = Object.keys(definition.storage).filter((name) => !storage[name]);
    if (missing.length > 0 && envelope.schemaVersion >= definition.schema.currentVersion) {
      throw new Error(`Storage slot ${missing[0]} is unavailable`);
    }
    disposeInitializedStorage = await initializeMissingStorage({
      definition,
      envelope,
      resource: persistedResource,
      storage,
    });
  } catch (error) {
    disposeInitializedStorage();
    disposeStorage();
    return {
      diagnostic: error instanceof Error ? error.message : "Storage load failed",
      envelope,
      retryable: true,
      status: "quarantined",
    };
  }
  try {
    return await resolveResource(
      definition,
      envelope,
      { resourceId: envelope.resourceId, storage },
      {
        readVersion: async () =>
          (await getWorkspaceResource({ db, id: envelope.resourceId }))?.schema_version ??
          undefined,
        compareAndSet: async ({
          expectedVersion,
          nextVersion,
          payload,
        }) => {
          const visibility = await resolveWorkspaceVisibility(db, workspaceId);
          const tables = resolveWorkspaceScopedTables(visibility);
          const hydrated = await hydrateResourceStorage(db, envelope.resourceId);
          let disposeInitializedStagedStorage: () => void = () => undefined;
          try {
            const { slots, storage: staged } = hydrated;
            disposeInitializedStagedStorage = await initializeMissingStorage({
              definition,
              envelope,
              resource: persistedResource,
              storage: staged,
            });
            const yjsUpdates = new Map<string, Uint8Array>();
            const committed = await compareAndSetWorkspaceResourceVersion({
              db,
              expectedVersion,
              mutatePayload: async (tx) => {
                await definition.schema.write?.(payload, {
                  resourceId: envelope.resourceId,
                  storage: staged,
                });
                for (const slot of slots) {
                  if (!slot.name) continue;
                  const before = storage[slot.name];
                  const after = staged[slot.name];
                  if (
                    slot.kind === "yjs" &&
                    slot.backing_id &&
                    before?.kind === "yjs" &&
                    after?.kind === "yjs"
                  ) {
                    yjsUpdates.set(
                      slot.backing_id,
                      encodeStateAsUpdateV2(
                        after.document,
                        encodeStateVector(before.document),
                      ),
                    );
                  }
                }
                const now = new Date().toISOString();
                const existingNames = new Set(
                  slots.flatMap((slot) => slot.name ? [slot.name] : []),
                );
                for (const [name, definitionSlot] of Object.entries(definition.storage)) {
                  if (existingNames.has(name)) continue;
                  const storageId = createId("storage");
                  const backingId = definitionSlot.kind === "yjs"
                    ? createId("yjs")
                    : null;
                  if (backingId) {
                    await tx.execute(
                      `INSERT INTO ${tables.yjsDocuments}
                        (id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
                      [backingId, workspaceId, now, now],
                    );
                  }
                  await tx.execute(
                    `INSERT INTO ${tables.workspaceStorageSlots}
                      (id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
                     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
                    [
                      storageId,
                      workspaceId,
                      envelope.resourceId,
                      name,
                      definitionSlot.kind,
                      backingId,
                      now,
                      now,
                    ],
                  );
                  const next = staged[name];
                  if (next?.kind === "key-value") {
                    for (const [key, value] of Object.entries(next.values)) {
                      await tx.execute(
                        `INSERT INTO ${tables.workspaceStorageValues}
                          (id, storage_id, workspace_id, key, value, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                          createId("storage-value"),
                          storageId,
                          workspaceId,
                          key,
                          JSON.stringify(value),
                          now,
                          now,
                        ],
                      );
                    }
                  } else if (next?.kind === "yjs" && backingId) {
                    const update = encodeStateAsUpdateV2(next.document);
                    await tx.execute(
                      `INSERT INTO ${tables.yjsDocumentUpdates}
                        (id, document_id, workspace_id, user_id, update_b64, created_at, updated_at)
                       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
                      [
                        createId("yjs-update"),
                        backingId,
                        workspaceId,
                        Uint8ArrayTob64(update),
                        now,
                        now,
                      ],
                    );
                  }
                }
                for (const slot of slots) {
                  if (!slot.name) continue;
                  const next = staged[slot.name];
                  if (next?.kind === "key-value") {
                    await tx.execute(
                      `DELETE FROM ${tables.workspaceStorageValues} WHERE storage_id = ?`,
                      [slot.id],
                    );
                    for (const [key, value] of Object.entries(next.values)) {
                      await tx.execute(
                        `INSERT INTO ${tables.workspaceStorageValues}
                          (id, storage_id, workspace_id, key, value, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [createId("storage-value"), slot.id, workspaceId, key, JSON.stringify(value), now, now],
                      );
                    }
                  }
                  const update = slot.backing_id
                    ? yjsUpdates.get(slot.backing_id)
                    : undefined;
                  if (slot.backing_id && update?.byteLength) {
                    await insertYjsDocumentUpdate(
                      tx,
                      slot.backing_id,
                      workspaceId,
                      Uint8ArrayTob64(update),
                      null,
                    );
                  }
                }
              },
              nextVersion,
              workspaceId,
              resourceId: envelope.resourceId,
            });
            if (committed) {
              for (const entry of storage ? Object.values(storage) : []) {
                if (entry.kind !== "yjs") continue;
                const slot = slots.find(
                  (candidate) =>
                    candidate.name != null &&
                    staged[candidate.name]?.kind === "yjs" &&
                    storage[candidate.name] === entry,
                );
                const update = slot?.backing_id
                  ? yjsUpdates.get(slot.backing_id)
                  : undefined;
                if (update?.byteLength) {
                  applyUpdateV2(entry.document, update, PERSISTED_YJS_UPDATE_ORIGIN);
                }
              }
            }
            return committed;
          } finally {
            disposeInitializedStagedStorage();
            hydrated.dispose();
          }
        },
      },
    );
  } finally {
    disposeInitializedStorage();
    disposeStorage();
  }
}
