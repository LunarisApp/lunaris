import type {
  ResourceCreateResult,
  ResourceTypeDefinition,
  ResourceInitializeContext,
  ResourceStorageDefinition,
} from "@lunarisapp/plugin-sdk";
import { permission } from "@repo/auth/permissions";
import { type Database, ensureTx } from "@repo/data/core";
import {
  queueFileAttachmentDeletion,
  uploadFileAttachmentToWorkspaceResource,
} from "@repo/data/features/files";
import {
  createWorkspaceFolder,
  createWorkspaceResource,
  deleteWorkspaceResources,
  getWorkspaceResource,
  getWorkspaceResourceDescendants,
  moveWorkspaceResource,
  renameWorkspaceResource,
  reorderWorkspaceResources,
  touchWorkspaceResource,
  getWorkspaceResourceTrashGroupIds,
  restoreWorkspaceResourceSubtrees,
  trashWorkspaceResourceSubtrees,
} from "@repo/data/features/workspace-resources";
import {
  getResourceStorageSlots,
  getStorageValues,
  deleteResourceStorage,
  hasStorageBackingReference,
} from "@repo/data/features/workspace-storage-slots";
import {
  applyYjsDocumentUpdates,
  deleteYjsDocument,
  getYjsDocumentUpdates,
} from "@repo/data/features/yjs";
import type { ApiClient } from "@repo/data/http";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import type { ReserveResourceCapacity } from "@repo/features/entitlements";
import {
  type PermissionCheck,
  requirePermission,
} from "@repo/features/permissions";
import { removeRecentFilesByResourceIds } from "../../search";
import { VIRTUAL_ROOT_ID } from "../constants";
import type { WorkspaceResourcesMap } from "../types";
import { filterOutNestedSelections } from "../utils";
import type { WorkspaceExplorerActions } from "./contexts";

function toDbParentId(parentId: string): string | null {
  return parentId === VIRTUAL_ROOT_ID ? null : parentId;
}

export function createBoundActions(params: {
  api?: ApiClient;
  currentUserId?: string | null;
  db: Database;
  getResourcesMap?: () => WorkspaceResourcesMap;
  permissionCheck?: PermissionCheck;
  workspaceId: string;
  reserveResourceCapacity: ReserveResourceCapacity;
  organizationNavigation: {
    closeViewInstances: (viewInstanceIds: string[]) => void;
    setResourceTitle: (resourceId: string, title: string) => void;
  };
}): WorkspaceExplorerActions {
  const {
    api,
    currentUserId = null,
    db,
    getResourcesMap = () => new Map(),
    permissionCheck = () => true,
    workspaceId,
    reserveResourceCapacity,
    organizationNavigation,
  } = params;

  const createWithCapacity = async <T,>(create: () => Promise<T>) => {
    const reservation = await reserveResourceCapacity();
    try {
      const result = await create();
      reservation.commit();
      return result;
    } catch (error) {
      reservation.rollback();
      throw error;
    }
  };

  const hardDeleteResources = async (
    resourceIds: string[],
    allowActive = false,
  ) => {
    if (resourceIds.length === 0) return;
    requirePermission(permissionCheck, permission.content.delete);

    const roots = filterOutNestedSelections(resourceIds, getResourcesMap());
    if (roots.length === 0) return;

    try {
      const { idsToDelete } = await ensureTx(
        db,
        async (tx) => {
          const idsToDelete: string[] = [];
          const removedBackings = new Map<
            string,
            { backingId: string; kind: "file" | "yjs"; metadata: string | null }
          >();
          const seen = new Set<string>();

          for (const rootId of roots) {
            let groupIds = await getWorkspaceResourceTrashGroupIds({
              db: tx,
              workspaceId,
              rootId,
            });
            if (groupIds.length === 0 && allowActive) {
              const rootItem = await getWorkspaceResource({ db: tx, id: rootId });
              const descendants = await getWorkspaceResourceDescendants({
                db: tx,
                workspaceId,
                resourceId: rootId,
              });
              groupIds = [
                ...(rootItem ? [rootItem.id] : []),
                ...descendants.map(({ id }) => id),
              ];
            }

            for (const id of groupIds) {
              if (seen.has(id)) continue;
              seen.add(id);
              idsToDelete.push(id);
              const storageSlots = await deleteResourceStorage(tx, id);
              for (const slot of storageSlots) {
                if (
                  (slot.kind === "file" || slot.kind === "yjs") &&
                  slot.backing_id
                ) {
                  removedBackings.set(`${slot.kind}:${slot.backing_id}`, {
                    backingId: slot.backing_id,
                    kind: slot.kind,
                    metadata: slot.metadata,
                  });
                }
              }
            }
          }

          for (const backing of removedBackings.values()) {
            if (
              await hasStorageBackingReference(
                tx,
                backing.kind,
                backing.backingId,
              )
            ) {
              continue;
            }
            if (backing.kind === "yjs") {
              await deleteYjsDocument(tx, backing.backingId);
              continue;
            }
            if (!backing.metadata) continue;
            try {
              await queueFileAttachmentDeletion({
                db: tx,
                metadata: JSON.parse(backing.metadata),
                workspaceId,
              });
            } catch {
              // Corrupt metadata must not block resource deletion.
            }
          }

          await deleteWorkspaceResources({ db: tx, ids: idsToDelete });

          return { idsToDelete };
        }
      );

      if (idsToDelete.length > 0) {
        organizationNavigation.closeViewInstances(idsToDelete);
      }
      if (idsToDelete.length > 0) {
        removeRecentFilesByResourceIds(workspaceId, idsToDelete);
      }
      return { count: idsToDelete.length, roots: roots.length };
    } catch (e) {
      log.error({
        tag: "WorkspaceExplorer",
        msg: "Delete failed",
        error: parseError(e),
        resourceIds,
      });
      throw e;
    }
  };

  const deleteResources: WorkspaceExplorerActions["deleteResources"] = async (
    resourceIds,
  ) => {
    if (resourceIds.length === 0) return;
    requirePermission(permissionCheck, permission.content.delete);
    const roots = filterOutNestedSelections(resourceIds, getResourcesMap());
    const trashedIds = await trashWorkspaceResourceSubtrees({ db, workspaceId, rootIds: roots });
    organizationNavigation.closeViewInstances(trashedIds);
    removeRecentFilesByResourceIds(workspaceId, trashedIds);
    posthog.capture("explorer_resource_trashed", {
      count: trashedIds.length,
      roots: roots.length,
    });
  };

  const restoreResources: WorkspaceExplorerActions["restoreResources"] = async (
    rootIds,
  ) => {
    if (rootIds.length === 0) return;
    requirePermission(permissionCheck, permission.content.write);
    const groups = await Promise.all(
      rootIds.map((rootId) =>
        getWorkspaceResourceTrashGroupIds({ db, workspaceId, rootId }),
      ),
    );
    const count = new Set(groups.flat()).size;
    const reservation = await reserveResourceCapacity(count);
    try {
      const restored = await restoreWorkspaceResourceSubtrees({ db, workspaceId, rootIds });
      reservation.commit(restored);
      reservation.rollback();
      posthog.capture("explorer_resource_restored", {
        count: restored,
        roots: rootIds.length,
      });
    } catch (error) {
      reservation.rollback();
      throw error;
    }
  };

  const purgeResources: WorkspaceExplorerActions["purgeResources"] = async (
    rootIds,
  ) => {
    const result = await hardDeleteResources(rootIds);
    if (result) posthog.capture("explorer_resource_purged", result);
  };

  return {
    createResource: async (
      parentId: string,
      resourceType: ResourceTypeDefinition,
      name = "",
      initialPayload?: ResourceInitializeContext["initialPayload"]
    ) => {
      requirePermission(permissionCheck, permission.content.write);
      const { resourceTypeId } = resourceType;
      const persistResource = async (
        resourceName: string,
        initialPayload?: ResourceInitializeContext["initialPayload"]
      ): Promise<ResourceCreateResult> => {
        const created = await createWithCapacity(() =>
          createWorkspaceResource({
            db,
            workspaceId,
            initialPayload,
            name: resourceName,
            parentId: toDbParentId(parentId),
            resourceTypeId,
            schemaVersion: resourceType.schema.currentVersion,
            storage: resourceType.storage,
            userId: currentUserId,
          })
        );
        return {
          name: created.name,
          resourceId: created.id,
          storage: created.storage,
        };
      };

      if (resourceType.createInWorkspace) {
        const createdResourceIds = new Set<string>();
        const storageResourceIds = new Map<string, string>();
        const cleanupCreatedResources = async () => {
          if (createdResourceIds.size === 0) return;
          await hardDeleteResources([...createdResourceIds], true);
          createdResourceIds.clear();
        };
        let result: ResourceCreateResult | null;
        try {
          result = await resourceType.createInWorkspace({
            createResource: async (input = {}) => {
              const created = await persistResource(
                input.name ?? "",
                input.initialPayload
              );
              createdResourceIds.add(created.resourceId);
              for (const handle of Object.values(created.storage)) {
                storageResourceIds.set(handle.storageId, created.resourceId);
              }
              return created;
            },
            deleteResource: async (resourceId) => {
              if (!createdResourceIds.has(resourceId)) {
                throw new Error("Create handler cannot delete an unrelated resource");
              }
              await hardDeleteResources([resourceId], true);
              createdResourceIds.delete(resourceId);
              for (const [storageId, ownerId] of storageResourceIds) {
                if (ownerId === resourceId) storageResourceIds.delete(storageId);
              }
            },
            uploadFile: async ({ file, storage }) => {
              const resourceId = storageResourceIds.get(storage.storageId);
              if (!resourceId || storage.kind !== "file") {
                throw new Error("Create handler cannot upload to unrelated storage");
              }
              if (!api) throw new Error("API client required for file upload");
              const metadata = await uploadFileAttachmentToWorkspaceResource({
                api,
                db,
                file,
                resourceId: resourceId,
                workspaceId,
                storageId: storage.storageId,
              });
              return {
                fileExtension: metadata.fileExtension,
                fileId: metadata.attachmentId,
                filename: metadata.filename,
                mediaType: metadata.mediaType,
                size: metadata.size,
                uploadedAt: metadata.uploadedAt,
              };
            },
            parentId,
          });
          if (result && !createdResourceIds.has(result.resourceId)) {
            throw new Error("Create handler returned an unrelated resource");
          }
        } catch (error) {
          await cleanupCreatedResources();
          throw error;
        }
        if (!result) {
          await cleanupCreatedResources();
          return null;
        }
        if (createdResourceIds.size > 0) {
          posthog.capture("explorer_resource_created", {
            count: createdResourceIds.size,
            type: "custom",
            resourceTypeId,
          });
        }
        return result;
      }

      const result = await persistResource(name, initialPayload);
      posthog.capture("explorer_resource_created", {
        type: "resource",
        resourceTypeId,
      });
      return result;
    },

    createFolder: async (parentId: string) => {
      requirePermission(permissionCheck, permission.content.write);
      const id = await createWithCapacity(() =>
        createWorkspaceFolder({
          db,
          workspaceId,
          name: "",
          parentId: toDbParentId(parentId),
        })
      );
      posthog.capture("explorer_resource_created", { type: "folder" });
      return id;
    },

    renameResource: async (resourceId: string, newName: string) => {
      requirePermission(permissionCheck, permission.content.write);
      await renameWorkspaceResource({ db, id: resourceId, name: newName });
      organizationNavigation.setResourceTitle(resourceId, newName);
    },

    deleteResource: (resourceId: string) => deleteResources([resourceId]),

    deleteResources,
    purgeResources,
    restoreResources,

    duplicateResource: async (
      resourceId,
      { copyLabel, trigger, untitledLabel }
    ) => {
      requirePermission(permissionCheck, permission.content.write);
      const source = getResourcesMap().get(resourceId);
      if (!source?.resource_type_id) return;

      const storage: Record<string, ResourceStorageDefinition[string]> = {};
      for (const slot of await getResourceStorageSlots(db, resourceId)) {
        if (!slot.name || !slot.kind) continue;
        if (slot.kind === "yjs" && slot.backing_id) {
          const updates = await getYjsDocumentUpdates(db, slot.backing_id);
          storage[slot.name] = {
            kind: "yjs",
            initialize: (doc) => applyYjsDocumentUpdates(doc, updates),
          };
        } else if (slot.kind === "key-value") {
          const values = Object.fromEntries(
            (await getStorageValues(db, slot.id)).map((row) => {
              const raw = row.value;
              if (raw == null) return [row.key ?? "", null];
              try {
                return [row.key ?? "", JSON.parse(raw)];
              } catch {
                return [row.key ?? "", raw];
              }
            }),
          );
          storage[slot.name] = { kind: "key-value", initialize: () => values };
        } else if (slot.kind === "file") {
          storage[slot.name] = { kind: "file" };
        }
      }
      await createWithCapacity(() =>
        createWorkspaceResource({
          db,
          icon: source.icon ?? undefined,
          name: `${source.name || untitledLabel} ${copyLabel}`,
          parentId: source.parent_id,
          resourceTypeId: source.resource_type_id,
          schemaVersion: source.schema_version ?? 1,
          workspaceId,
          storage,
          userId: currentUserId,
        })
      );

      posthog.capture("explorer_resource_duplicated", {
        resourceTypeId: source.resource_type_id,
        trigger,
      });
    },

    moveResource: async (resourceId: string, newParentId: string, newPosition: number) => {
      requirePermission(permissionCheck, permission.content.write);
      await moveWorkspaceResource({ db, id: resourceId, newParentId: toDbParentId(newParentId), newPosition });
    },

    reorderChildren: async (
      _parentId: string,
      orderedIds: string[]
    ) => {
      requirePermission(permissionCheck, permission.content.write);
      await reorderWorkspaceResources({ db, orderedIds });
    },

    touchResource: (resourceId: string) => {
      requirePermission(permissionCheck, permission.content.write);
      return touchWorkspaceResource({ db, id: resourceId });
    },
  };
}
