import { useHostResourceAwareness } from "./resource-presence";
import { useHostYjsAwareness } from "./use-yjs-awareness";
import type {
  PluginResourceData,
  PluginResourceReadContext,
  PluginDownloads,
  PluginFileStorage,
  PluginResource,
  PluginStoredFileMetadata,
} from "@lunarisapp/plugin-sdk";
import {
  assertPluginDownloadInput,
  useResourceTypes,
} from "@lunarisapp/plugin-sdk";
import {
  type PluginDataCapabilities,
  type PluginHostCapabilities,
  type PluginSdkRuntime,
  ExtensionSdkProvider,
} from "@lunarisapp/plugin-sdk/internal";
import { AttachmentState } from "@powersync/common";
import { permission } from "@repo/auth/permissions";
import { usePowerSync } from "@repo/data/core";
import {
  createDeviceControlClient,
  createDeviceReadCoordinator,
} from "@repo/data/features/agent-content";
import {
  downloadAttachmentFromQuery,
  useAttachmentObjectUrl,
  useAttachmentQueryState,
} from "@repo/data/features/attachments";
import {
  buildFileAttachmentQuery,
  type FileMetadata,
  uploadFileAttachmentToWorkspaceResource,
} from "@repo/data/features/files";
import { getWorkspace } from "@repo/data/features/workspaces";
import {
  createStorageValueService,
  ensureWorkspaceStorageSlot,
  getStorageSlot,
  getResourceStorageSlots,
  useWorkspaceStorageSlot,
  useWorkspaceStorageSlots,
  useStorageSlot,
  useStorageValue,
} from "@repo/data/features/workspace-storage-slots";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import {
  getYjsDocumentUpdateRows,
  getYjsDocumentUpdates,
  useDocumentLastEdited as useDocumentLastEditedReal,
  useReadyYjsDocument as useReadyYjsDocumentReal,
} from "@repo/data/features/yjs";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth/context";
import { useLocale } from "@repo/features/locale";
import {
  requirePermission,
  usePermission,
  usePermissionCheck,
} from "@repo/features/permissions";
import { useCurrentWorkspace as useCurrentWorkspaceReal } from "@repo/workspaces/workspace";
import { usePlatform } from "@repo/platform";
import {
  useResourceBreadcrumb,
  useNavigateToResource,
  useWorkspaceActions,
  useWorkspaceChildrenMap,
  useWorkspaceResourcesMap,
  useWorkspaceTrashMap as useWorkspaceTrashMapReal,
} from "@repo/workspaces/workspace-explorer";
import { useStableInitialLoading } from "@repo/features/sync-status";
import { useOrgMembersMap } from "@repo/features/organization";
import {
  useOrganizationNavigation,
  useOrganizationViewState,
} from "@repo/workspaces/organization-navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useNavigate, useParams } from "react-router";
import {
  assertAgentToolWorkspaceContext,
  builtInAgentToolPolicy,
  builtInAgentToolScope,
  executeBuiltInAgentTool,
} from "./agent-tools";
import {
  markResourceOpenDataReady,
  reportResourceOpenFailure,
} from "./resource-open-performance";
import { getEntityReferencePath } from "./entity-reference-navigation";
import { toPluginLocale } from "./locale";
import { createPluginLifecycle } from "./lifecycle";
import { PluginRegistry } from "./registry";
import { resolveHostResource } from "./resource-resolution";

interface ResourceDataRow {
  created_at: string | null;
  id: string;
  name: string | null;
  parent_id: string | null;
  position: number | null;
  resource_type_id: string | null;
  schema_version: number | null;
  updated_at: string | null;
  workspace_id: string;
}

const RESOURCE_DATA_WORKSPACE_RESOURCES = `
  SELECT id, workspace_id, name, parent_id, resource_type_id, schema_version, position, created_at, updated_at
  FROM workspace_resources
  WHERE NOT EXISTS (
    SELECT 1 FROM workspace_resource_trash trash WHERE trash.id = workspace_resources.id
  )
  UNION ALL
  SELECT id, workspace_id, name, parent_id, resource_type_id, schema_version, position, created_at, updated_at
  FROM local_workspace_resources
  WHERE NOT EXISTS (
    SELECT 1 FROM local_workspace_resource_trash trash WHERE trash.id = local_workspace_resources.id
  )
`;

async function toPluginResourceData(
  db: PluginDatabase,
  row: ResourceDataRow
): Promise<PluginResourceData> {
  const storage = Object.fromEntries(
    (await getResourceStorageSlots(db, row.id))
      .filter((slot) => slot.name && slot.kind)
      .map((slot) => [slot.name!, { kind: slot.kind!, storageId: slot.id }])
  ) as PluginResourceData["storage"];
  return {
    createdAt: row.created_at,
    name: row.name,
    parentId: row.parent_id,
    resourceTypeId: row.resource_type_id ?? "lunaris.folder",
    resourceId: row.id,
    schemaVersion: row.schema_version ?? 1,
    storage,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

type PluginDatabase = ReturnType<typeof usePowerSync>;
type PluginResourceDataResolution = Awaited<
  ReturnType<PluginResourceReadContext["resolveResource"]>
>;

const quarantined = (diagnostic: string): PluginResourceDataResolution => ({
  diagnostic,
  retryable: true,
  status: "quarantined",
});

async function resolvePluginResourceData(
  db: PluginDatabase,
  plugins: PluginRegistry,
  workspaceId: string,
  resource: PluginResourceData | null
): Promise<PluginResourceDataResolution> {
  const registered = resource
    ? plugins.getResourceType(resource.resourceTypeId)
    : undefined;
  if (!(resource && registered)) {
    return quarantined("Resource definition is unavailable");
  }

  const resolution = await resolveHostResource({
    db,
    definition: registered.definition,
    envelope: {
      parentId: resource.parentId,
      resourceId: resource.resourceId,
      resourceTypeId: resource.resourceTypeId,
      schemaId: registered.definition.schema.id,
      schemaVersion: resource.schemaVersion,
    },
    workspaceId,
  });
  return resolution.status === "ready"
    ? { status: "ready" }
    : {
        diagnostic: resolution.diagnostic,
        retryable: resolution.retryable,
        status: "quarantined",
      };
}

function toPluginResource(
  row: WorkspaceResourceEntity,
  storageByResource: Map<string, PluginResource["storage"]>
): PluginResource {
  return {
    createdAt: row.created_at,
    name: row.name,
    parentId: row.parent_id,
    resourceTypeId: row.resource_type_id ?? "lunaris.folder",
    resourceId: row.id,
    schemaVersion: row.schema_version ?? 1,
    storage: storageByResource.get(row.id) ?? {},
    position: row.position,
    updatedAt: row.updated_at,
  };
}

function useStorageByResource() {
  const { workspaceId } = useCurrentWorkspaceReal();
  const slots = useWorkspaceStorageSlots(workspaceId);
  return useMemo(() => {
    const result = new Map<string, PluginResource["storage"]>();
    for (const slot of slots.data) {
      if (!(slot.resource_id && slot.name && slot.kind)) {
        continue;
      }
      const resource = result.get(slot.resource_id) ?? {};
      result.set(slot.resource_id, {
        ...resource,
        [slot.name]: {
          kind: slot.kind,
          storageId: slot.id,
        } as PluginResource["storage"][string],
      });
    }
    return result;
  }, [slots.data]);
}

function toPluginStoredFileStatus(state: number | null | undefined) {
  switch (state) {
    case AttachmentState.QUEUED_UPLOAD:
      return "queued-upload" as const;
    case AttachmentState.QUEUED_DOWNLOAD:
      return "queued-download" as const;
    case AttachmentState.QUEUED_DELETE:
      return "queued-delete" as const;
    case AttachmentState.SYNCED:
      return "synced" as const;
    case AttachmentState.ARCHIVED:
      return "archived" as const;
    default:
      return "unknown" as const;
  }
}

function toPluginStoredFileMetadata(
  metadata: FileMetadata
): PluginStoredFileMetadata {
  return {
    fileExtension: metadata.fileExtension,
    fileId: metadata.attachmentId,
    filename: metadata.filename,
    mediaType: metadata.mediaType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
  };
}

function useReadyYjsDocument(
  documentId: string | undefined,
  workspaceId: string,
  options?: {
    enabled?: boolean;
    performanceResourceId?: string | null;
    userId?: string | null;
  }
) {
  const result = useReadyYjsDocumentReal(documentId, workspaceId, options);
  const { cacheOutcome, error, isLoading, yDoc, queueTiming } = result;
  const performanceResourceId = options?.performanceResourceId;
  useEffect(() => {
    if (!(documentId && performanceResourceId) || options?.enabled === false) {
      return;
    }
    if (error) {
      reportResourceOpenFailure(performanceResourceId, "yjs");
    } else if (!isLoading && yDoc) {
      markResourceOpenDataReady(
        performanceResourceId,
        cacheOutcome,
        queueTiming
      );
    } else if (!isLoading) {
      reportResourceOpenFailure(performanceResourceId, "missing_document");
    }
  }, [
    cacheOutcome,
    documentId,
    error,
    isLoading,
    options?.enabled,
    performanceResourceId,
    queueTiming,
    yDoc,
  ]);
  return result;
}

function createDataAdapter(plugins: PluginRegistry): PluginDataCapabilities {
  const adapter: PluginDataCapabilities = {
    useKeyValue: <T,>(storageId: string, key: string) => {
      const db = usePowerSync();
      const { workspaceId } = useCurrentWorkspaceReal();
      const permissionCheck = usePermissionCheck();
      const result = useStorageValue<T>(storageId, key);
      const service = useMemo(
        () => createStorageValueService(db, workspaceId, storageId),
        [db, workspaceId, storageId]
      );
      const set = useCallback(
        async (next: T) => {
          requirePermission(permissionCheck, permission.content.write);
          await service.set(key, next);
        },
        [key, permissionCheck, service]
      );
      const remove = useCallback(async () => {
        requirePermission(permissionCheck, permission.content.delete);
        await service.remove(key);
      }, [key, permissionCheck, service]);
      return {
        isFetching: result.isFetching,
        isLoading: result.isLoading,
        remove,
        set,
        value: result.value,
      };
    },
    useWorkspaceKeyValue: <T,>(
      pluginId: string,
      storageId: string,
      key: string
    ) => {
      const registered = plugins.getWorkspaceStorage(storageId);
      if (!registered || registered.extensionId !== pluginId) {
        throw new Error(
          `Workspace storage "${storageId}" is not registered by "${pluginId}"`
        );
      }
      const db = usePowerSync();
      const { workspaceId } = useCurrentWorkspaceReal();
      const permissionCheck = usePermissionCheck();
      const slot = useWorkspaceStorageSlot({
        name: storageId,
        pluginId,
        workspaceId,
      });
      const currentSlot = slot.data[0];
      const result = useStorageValue<T>(currentSlot?.id ?? "", key);
      useEffect(() => {
        if (!workspaceId || currentSlot) {
          return;
        }
        void ensureWorkspaceStorageSlot({
          db,
          name: storageId,
          pluginId,
          workspaceId,
        });
      }, [currentSlot, db, pluginId, workspaceId, storageId]);
      const getService = useCallback(async () => {
        const resolved =
          currentSlot ??
          (await ensureWorkspaceStorageSlot({
            db,
            name: storageId,
            pluginId,
            workspaceId,
          }));
        if (!resolved) {
          throw new Error("Could not provision workspace storage");
        }
        return createStorageValueService(db, workspaceId, resolved.id);
      }, [currentSlot, db, pluginId, workspaceId, storageId]);
      const set = useCallback(
        async (next: T) => {
          requirePermission(permissionCheck, permission.content.write);
          await (await getService()).set(key, next);
        },
        [getService, key, permissionCheck]
      );
      const remove = useCallback(async () => {
        requirePermission(permissionCheck, permission.content.delete);
        await (await getService()).remove(key);
      }, [getService, key, permissionCheck]);
      return {
        isFetching: result.isFetching,
        isLoading: result.isLoading,
        remove,
        set,
        value: result.value,
      };
    },
    useYjsAwareness: useHostYjsAwareness,
    useResourceAwareness: useHostResourceAwareness,
    useReadyYjsStorage: (storage, workspaceId, options) => {
      const slot = useStorageSlot(storage?.storageId ?? "");
      const resolved = slot.data[0];
      if (resolved && resolved.kind !== "yjs") {
        throw new Error("Storage handle does not reference Yjs");
      }
      return useReadyYjsDocument(
        resolved?.backing_id ?? undefined,
        workspaceId,
        {
          ...options,
          enabled: options?.enabled !== false && !slot.isLoading,
          performanceResourceId: resolved?.resource_id,
        }
      );
    },
  };
  return adapter;
}

function usePluginResourceReadContext(
  plugins: PluginRegistry
): PluginResourceReadContext {
  const db = usePowerSync();
  const { workspaceId } = useCurrentWorkspaceReal();
  return useMemo(() => {
    const getResource = async (resourceId: string) => {
      if (!workspaceId) {
        return null;
      }
      const rows = await db.getAll<ResourceDataRow>(
        `SELECT * FROM (${RESOURCE_DATA_WORKSPACE_RESOURCES}) items WHERE id = ? AND workspace_id = ? LIMIT 1`,
        [resourceId, workspaceId]
      );
      return rows[0] ? toPluginResourceData(db, rows[0]) : null;
    };
    return {
      getYjsStorageUpdates: async (storage) => {
        const slot = await getStorageSlot(db, storage.storageId);
        if (
          slot?.kind !== "yjs" ||
          slot.workspace_id !== workspaceId ||
          !slot.backing_id
        ) {
          throw new Error("Invalid Yjs storage handle");
        }
        return (await getYjsDocumentUpdates(db, slot.backing_id)).map(
          ({ update_b64 }) => ({
            updateBase64: update_b64,
          })
        );
      },
      getWorkspaceResource: getResource,
      getWorkspaceResourceChildren: async (parentId) => {
        if (!workspaceId) {
          return [];
        }
        const rows = await db.getAll<ResourceDataRow>(
          `SELECT * FROM (${RESOURCE_DATA_WORKSPACE_RESOURCES}) items WHERE parent_id = ? AND workspace_id = ? ORDER BY position ASC, created_at ASC, id ASC`,
          [parentId, workspaceId]
        );
        return Promise.all(rows.map((row) => toPluginResourceData(db, row)));
      },
      resolveResource: async (resourceId) => {
        if (!workspaceId) {
          return quarantined("Workspace context is unavailable");
        }
        return resolvePluginResourceData(
          db,
          plugins,
          workspaceId,
          await getResource(resourceId)
        );
      },
    };
  }, [db, plugins, workspaceId]);
}

function createRuntime(plugins: PluginRegistry): PluginHostCapabilities {
  return {
    useApiTransport: () => {
      const api = useApi();
      return useMemo(
        () => ({
          baseUrl: api.baseUrl,
          fetch: api.fetch as typeof globalThis.fetch,
        }),
        [api]
      );
    },
    useDownloads: () => {
      const { downloads } = usePlatform();
      return useMemo<PluginDownloads>(
        () => ({
          saveChunks: async ({ chunks, mimeType, suggestedName, signal }) => {
            assertPluginDownloadInput({
              data: new ArrayBuffer(0),
              mimeType,
              suggestedName,
            });
            const parts: ArrayBuffer[] = [];
            let total = 0;
            for await (const chunk of chunks) {
              signal?.throwIfAborted();
              if (!(chunk instanceof Uint8Array)) {
                throw new Error("Download chunks must be byte arrays");
              }
              total += chunk.byteLength;
              if (total > 256 * 1024 * 1024) {
                throw new Error("Download exceeds 256 MiB");
              }
              parts.push(chunk.slice().buffer);
            }
            signal?.throwIfAborted();
            const url = URL.createObjectURL(
              new Blob(parts, { type: mimeType })
            );
            try {
              downloads.downloadUrl(url, suggestedName);
            } finally {
              setTimeout(() => URL.revokeObjectURL(url), 10_000);
            }
          },
          save: async ({ data, mimeType, suggestedName }) => {
            assertPluginDownloadInput({ data, mimeType, suggestedName });
            const url = URL.createObjectURL(
              new Blob([data], { type: mimeType })
            );
            try {
              downloads.downloadUrl(url, suggestedName);
            } finally {
              setTimeout(() => URL.revokeObjectURL(url), 10_000);
            }
          },
        }),
        [downloads]
      );
    },
    useYjsStorageUpdateRows: () => {
      const db = usePowerSync();
      return useCallback(
        async (storage) => {
          const slot = await getStorageSlot(db, storage.storageId);
          if (
            storage.kind !== "yjs" ||
            slot?.kind !== "yjs" ||
            !slot.backing_id
          ) {
            throw new Error("Invalid Yjs storage handle");
          }
          return (await getYjsDocumentUpdateRows(db, slot.backing_id)).map(
            (row) => ({
              createdAt: row.created_at,
              id: row.id,
              updateBase64: row.update_b64,
              userId: row.user_id,
            })
          );
        },
        [db]
      );
    },
    useFileStorage: () => {
      const api = useApi();
      const db = usePowerSync();
      const { workspaceId } = useCurrentWorkspaceReal();
      const permissionCheck = usePermissionCheck();
      const download: PluginFileStorage["download"] = useCallback(
        async (storage) => {
          if (storage.kind !== "file") {
            throw new Error("File storage required");
          }
          const slot = await getStorageSlot(db, storage.storageId);
          if (
            slot?.kind !== "file" ||
            slot.workspace_id !== workspaceId ||
            !slot.resource_id
          ) {
            throw new Error("Invalid file storage handle");
          }
          const { query, params } = buildFileAttachmentQuery(
            slot.resource_id,
            storage.storageId
          );
          return downloadAttachmentFromQuery<FileMetadata>({
            db,
            workspaceId,
            query,
            queryParams: params,
          });
        },
        [db, workspaceId]
      );
      const upload: PluginFileStorage["upload"] = useCallback(
        async ({ file, storage }) => {
          if (storage.kind !== "file") {
            throw new Error("File storage required");
          }
          requirePermission(permissionCheck, permission.content.write);
          const slot = await getStorageSlot(db, storage.storageId);
          if (
            slot?.kind !== "file" ||
            slot.workspace_id !== workspaceId ||
            !slot.resource_id
          ) {
            throw new Error("Invalid file storage handle");
          }
          const metadata = await uploadFileAttachmentToWorkspaceResource({
            api,
            db,
            file,
            resourceId: slot.resource_id,
            workspaceId,
            replaceExisting: true,
            storageId: storage.storageId,
          });
          return toPluginStoredFileMetadata(metadata);
        },
        [api, db, permissionCheck, workspaceId]
      );
      return useMemo(() => ({ download, upload }), [download, upload]);
    },
    useCurrentWorkspace: () => {
      const { workspaceId, workspace } = useCurrentWorkspaceReal();
      return {
        workspaceId,
        workspace: workspace
          ? { id: workspace.id, name: workspace.name }
          : null,
      };
    },
    useCurrentUser: () => {
      const auth = useAuth();
      const { data: session, isPending } = auth.useSession();
      return { isLoading: isPending, user: session?.user };
    },
    useYjsStorageLastEdited: (storage) => {
      const slot = useStorageSlot(storage.storageId);
      const documentId =
        storage.kind === "yjs" && slot.data[0]?.kind === "yjs"
          ? (slot.data[0]?.backing_id ?? "")
          : "";
      return useDocumentLastEditedReal(documentId);
    },
    useStoredFile: (storage) => {
      const { workspaceId } = useCurrentWorkspaceReal();
      const slot = useStorageSlot(storage.storageId);
      const resourceId = slot.data[0]?.resource_id ?? "";
      const { query, params } = useMemo(
        () => buildFileAttachmentQuery(resourceId, storage.storageId),
        [resourceId, storage.storageId]
      );
      const { attachment, metadata } = useAttachmentQueryState<FileMetadata>({
        query,
        queryParams: params,
      });
      const objectUrl = useAttachmentObjectUrl({
        attachment,
        resourceId,
        mediaType: metadata?.mediaType,
        workspaceId,
      });
      return {
        file: attachment
          ? {
              hasSynced: attachment.has_synced === 1,
              id: attachment.id,
              localUri: attachment.local_uri ?? null,
              mediaType: attachment.media_type ?? null,
              status: toPluginStoredFileStatus(attachment.state),
            }
          : null,
        metadata: metadata ? toPluginStoredFileMetadata(metadata) : null,
        objectUrl,
      };
    },
    useLocale: usePluginLocale,
    usePluginFetch: () => usePlatform().plugins.fetch,
    useLunarisContent: () => {
      const db = usePowerSync();
      const auth = useAuth();
      const { data: organization } = auth.useActiveOrganization();
      const { data: session } = auth.useSession();
      const permissionCheck = usePermissionCheck();
      const { workspaceId } = useCurrentWorkspaceReal();
      const { activeViewInstanceId } = useOrganizationViewState();
      const items = useWorkspaceResourcesMap();
      const storageByResource = useStorageByResource();
      const activeResourceId =
        activeViewInstanceId && items.has(activeViewInstanceId)
          ? activeViewInstanceId
          : null;
      const activeStorage = activeResourceId
        ? (storageByResource.get(activeResourceId) ?? {})
        : {};
      const readCoordinator = useMemo(
        () => createDeviceReadCoordinator(db),
        [db, organization?.id]
      );
      useEffect(() => () => readCoordinator.dispose(), [readCoordinator]);
      const client = useMemo(
        () =>
          createDeviceControlClient(db, {
            activeOrganizationId: () => organization?.id,
            actorId: () => session?.user.id,
            readCoordinator,
          }),
        [db, readCoordinator, session?.user.id, organization?.id]
      );
      return useMemo(
        () => ({
          activeWorkspaceId: workspaceId,
          activeResourceId,
          activeStorage,
          executeAgentTool: ({
            input,
            name,
            workspaceId: expectedWorkspaceId,
          }: {
            input: Record<string, unknown>;
            name: string;
            workspaceId: string;
          }) => {
            if (!(organization?.id && workspaceId)) {
              return Promise.reject(
                new Error("No active organization workspace")
              );
            }
            assertAgentToolWorkspaceContext(expectedWorkspaceId, workspaceId);
            const scope = builtInAgentToolScope(name);
            switch (scope) {
              case "workspace:read":
                break;
              case "workspace:write":
                requirePermission(permissionCheck, permission.content.write);
                break;
              case "workspace:delete":
                requirePermission(permissionCheck, permission.content.delete);
                break;
              case null:
                return Promise.reject(new Error("Unknown built-in agent tool"));
              default:
                return Promise.reject(
                  new Error("Unsupported built-in agent tool scope")
                );
            }
            return executeBuiltInAgentTool(client, name, input, {
              workspaceId,
              organizationId: organization.id,
            });
          },
          getAgentToolPolicy: builtInAgentToolPolicy,
          listWorkspaces: async ({ consistency, cursor, limit } = {}) => {
            if (!organization?.id) {
              return Promise.reject(new Error("No active organization"));
            }
            const page = await client.listWorkspaces(
              organization.id,
              { cursor, limit },
              consistency ? { consistency } : undefined
            );
            return {
              items: page.items.map(({ id, name }) => ({ id, name })),
              nextCursor: page.nextCursor,
            };
          },
          readYjsStorageJson: async ({
            storage,
            workspaceId: requestedWorkspaceId,
          }) => {
            if (!organization?.id) {
              return Promise.reject(new Error("No active organization"));
            }
            const slot = await getStorageSlot(db, storage.storageId);
            if (
              storage.kind !== "yjs" ||
              slot?.kind !== "yjs" ||
              !slot.backing_id
            ) {
              throw new Error("Invalid Yjs storage handle");
            }
            return client.getYjsStorageJson(
              organization.id,
              requestedWorkspaceId ?? workspaceId,
              storage.storageId
            );
          },
          searchResources: async ({
            consistency,
            cursor,
            limit,
            workspaceId: requestedWorkspaceId,
            search,
          }) => {
            if (!organization?.id) {
              return Promise.reject(new Error("No active organization"));
            }
            const page = await client.searchResources(
              organization.id,
              {
                cursor,
                limit,
                workspaceId: requestedWorkspaceId,
                search,
              },
              consistency ? { consistency } : undefined
            );
            return {
              items: page.items.map(({ id, ...resource }) => ({
                ...resource,
                resourceId: id,
              })),
              nextCursor: page.nextCursor,
            };
          },
        }),
        [
          activeResourceId,
          activeStorage,
          client,
          db,
          permissionCheck,
          workspaceId,
          organization?.id,
        ]
      );
    },
    useOrgMembersMap,
    useWorkspaceChildrenMap: () => {
      const children = useWorkspaceChildrenMap();
      const storageByResource = useStorageByResource();
      return useMemo(
        () =>
          new Map(
            Array.from(children, ([parentId, items]) => [
              parentId,
              items.map((item) => toPluginResource(item, storageByResource)),
            ])
          ),
        [children, storageByResource]
      );
    },
    useWorkspaceResourceBreadcrumb: (resourceId) =>
      useResourceBreadcrumb(resourceId).map(({ id, ...entry }) => ({
        ...entry,
        resourceId: id,
        resourceTypeId: entry.resourceTypeId ?? "lunaris.folder",
      })),
    useWorkspaceResourceActions: () => {
      const actions = useWorkspaceActions();
      const resourceTypes = useResourceTypes();
      const byResourceTypeId = useMemo(
        () =>
          new Map(
            resourceTypes.map((resourceType) => [
              resourceType.resourceTypeId,
              resourceType,
            ])
          ),
        [resourceTypes]
      );
      return useMemo(
        () => ({
          createResource: ({
            resourceTypeId,
            initialPayload,
            name,
            parentId,
          }) => {
            const resourceType = byResourceTypeId.get(resourceTypeId);
            if (!resourceType) {
              return Promise.reject(
                new Error(`Unknown resource type: ${resourceTypeId}`)
              );
            }
            return actions.createResource(
              parentId,
              resourceType,
              name,
              initialPayload
            );
          },
          deleteResource: actions.deleteResource,
          renameResource: actions.renameResource,
          reorderResources: actions.reorderChildren,
          touchResource: actions.touchResource,
        }),
        [actions, byResourceTypeId]
      );
    },
    useWorkspaceResourceName: (resourceId) => {
      const items = useWorkspaceResourcesMap();
      return items.get(resourceId)?.name || "Untitled";
    },
    useWorkspaceResourcesMap: () => {
      const items = useWorkspaceResourcesMap();
      const storageByResource = useStorageByResource();
      return useMemo(
        () =>
          new Map(
            Array.from(items, ([id, item]) => [
              id,
              toPluginResource(item, storageByResource),
            ])
          ),
        [items, storageByResource]
      );
    },
    useWorkspaceTrashMap: () => {
      const trash = useWorkspaceTrashMapReal();
      return useMemo(
        () =>
          new Map(
            Array.from(trash).flatMap(([id, entry]) =>
              entry.purge_at && entry.trash_root_id && entry.trashed_at
                ? [
                    [
                      id,
                      {
                        purgeAt: entry.purge_at,
                        trashRootId: entry.trash_root_id,
                        trashedAt: entry.trashed_at,
                      },
                    ] as const,
                  ]
                : []
            )
          ),
        [trash]
      );
    },
    useResourceReadContext: () => usePluginResourceReadContext(plugins),
    useStableInitialLoading,
    useOrganizationNavigation: () => {
      const navigation = useOrganizationNavigation();
      const navigateToWorkspaceResource = useNavigateToResource();
      const navigate = useNavigate();
      const { organizationSlug } = useParams<{ organizationSlug: string }>();
      const db = usePowerSync();
      const auth = useAuth();
      const { data: organization } = auth.useActiveOrganization();
      return {
        closeViewInstances: navigation.closeViewInstances,
        navigateToWorkspaceResource,
        openEntityReference: async (reference) => {
          if (!(organizationSlug && organization?.id)) {
            return false;
          }
          const targetWorkspace = await getWorkspace({
            db,
            id: reference.workspaceId,
          });
          if (
            !targetWorkspace?.slug ||
            targetWorkspace.organization_id !== organization.id
          ) {
            return false;
          }
          navigate(
            getEntityReferencePath(
              organizationSlug,
              targetWorkspace.slug,
              reference
            )
          );
          return true;
        },
        openResource: (input) =>
          navigation.openResource({
            parentId: input.parentId,
            resourceId: input.resourceId,
            resourceTypeId: input.resourceTypeId,
            replaceCurrent: input.replaceCurrent,
            schemaVersion: input.schemaVersion,
            title: input.title,
          }),
        openResourceInNewWindow: (input) =>
          navigation.openResourceInNewWindow({
            parentId: input.parentId,
            resourceId: input.resourceId,
            resourceTypeId: input.resourceTypeId,
            replaceCurrent: input.replaceCurrent,
            schemaVersion: input.schemaVersion,
            title: input.title,
          }),
        openView: (input) =>
          navigation.openView({
            extensionId: input.extensionId,
            params: input.params,
            route: input.route,
            sourceResourceId: input.sourceResourceId,
            title: input.title,
            viewId: input.viewId,
          }),
        openViewInNewWindow: (input) =>
          navigation.openViewInNewWindow({
            extensionId: input.extensionId,
            params: input.params,
            route: input.route,
            sourceResourceId: input.sourceResourceId,
            title: input.title,
            viewId: input.viewId,
          }),
        setViewInstanceTitle: navigation.setViewInstanceTitle,
      };
    },
    useOrganizationAccess: () => ({
      canDeleteContent: usePermission(permission.content.delete),
      canWriteContent: usePermission(permission.content.write),
    }),
  };
}

function usePluginLocale() {
  const locale = useLocale().locale;
  return useMemo(() => toPluginLocale({ locale }), [locale]);
}

interface ExtensionHostRuntime {
  lifecycle: ReturnType<typeof createPluginLifecycle>;
  sdk: PluginSdkRuntime;
}

const ExtensionHostRuntimeContext = createContext<ExtensionHostRuntime | null>(
  null
);

export function ExtensionHostProvider({ children }: { children: ReactNode }) {
  const plugins = useMemo(() => new PluginRegistry(), []);
  const adapter = useMemo(() => createDataAdapter(plugins), [plugins]);
  const host = useMemo(() => createRuntime(plugins), [plugins]);
  const hostRuntime = useMemo(
    () => ({
      lifecycle: createPluginLifecycle({ plugins }),
      sdk: { contributions: plugins, data: adapter, host, services: plugins },
    }),
    [adapter, host, plugins]
  );

  return (
    <ExtensionHostRuntimeContext.Provider value={hostRuntime}>
      <ExtensionSdkProvider runtime={hostRuntime.sdk}>
        {children}
      </ExtensionSdkProvider>
    </ExtensionHostRuntimeContext.Provider>
  );
}

export function usePluginHostLifecycle() {
  const runtime = useContext(ExtensionHostRuntimeContext);
  if (!runtime) {
    throw new Error("ExtensionHostProvider must wrap extension consumers");
  }
  return runtime.lifecycle;
}
