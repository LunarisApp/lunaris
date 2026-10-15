import { useRemotePresenceDocument, useRemoteResourcePresence, useRemoteResourceAwareness, useRemoteYjsAwareness } from "./sandbox-awareness";
import { createYjsReplicaSync } from "./yjs-sync";
import { saveRemoteChunks } from "./downloads";
import {
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
} from "yjs";
import { satisfies } from "semver";
import type { IconSvgObject } from "./constants";
import type { PluginResourceReadContext } from "./resource-data";
import type { JsonValue } from "./json";
import type {
  PluginYjsPersistenceState,
  PluginYjsProvider,
} from "./data-adapter";
import type {
  ResourceCommand,
  ResourceCommandItem,
  ResourceCreationContext,
  ResourceTypeDefinition,
  ResourceTypeTarget,
  ResourcePayloadStorage,
  ResourceStorageHandle,
  ResourceViewDefinition,
  ResourceViewStatusProps,
  SearchIndexerContext,
  SearchQueryContext,
  SearchQueryOpenContext,
} from "./types";

function isCompatibleServiceVersion(
  providerVersion: string,
  consumerVersion: string,
): boolean {
  return satisfies(providerVersion, `^${consumerVersion}`);
}
import {
  assertPluginDefinitionMatchesManifest,
  getWorkspaceStorageContributions,
  getResourceCommandContributions,
  getResourceTypeContributions,
  getSearchIndexerContributions,
  getSearchQueryContributions,
  getViewContributions,
  preparePluginActivation,
  type ActivatedPluginContributions,
  type PluginDefinition,
  type ResourceTypeContribution,
} from "./definition";
export { assertPluginDefinitionMatchesManifest };
import { ExtensionScopeProvider } from "./scope";
import { ExtensionSdkProvider, type PluginSdkRuntime } from "./provider";
import type {
  PluginFileMetadata,
  PluginHostCapabilities,
  PluginStoredFileMetadata,
} from "./runtime-context";
import {
  assertSandboxIcon,
  cloneSandboxJsonValue,
  cloneSandboxWireValue,
  PLUGIN_SANDBOX_PROTOCOL_VERSION,
  PLUGIN_SANDBOX_RPC_TIMEOUT_MS,
  sandboxHandlerKey,
  type SandboxHostRequest,
  type SandboxPluginMessage,
  type SandboxWireObject,
  type SerializedSandboxCommand,
  type SerializedSandboxPluginDefinition,
  type SerializedSandboxResourceType,
} from "./sandbox-protocol";

const CONNECT_MESSAGE = "lunaris-plugin-sandbox-connect";

interface SandboxRegistrationResult {
  error?: { message: string; name: string };
}

interface SandboxRuntimeV6 {
  register(
    pluginId: string,
    definition: PluginDefinition,
  ): Promise<SandboxRegistrationResult>;
}

declare global {
  var __LUNARIS_PLUGIN_SANDBOX_V6__: SandboxRuntimeV6 | undefined;
}

type SandboxHostCall = (method: string, args?: unknown[]) => Promise<unknown>;

interface Handler {
  invoke(input: unknown, hostCall: SandboxHostCall): Promise<unknown> | unknown;
}

interface RemoteBridge {
  call(method: string, args?: unknown[]): Promise<unknown>;
  getSnapshot(): SandboxWireObject;
  subscribe(listener: () => void): () => void;
  update(snapshot: SandboxWireObject): void;
}

function entriesMap<T>(value: unknown): Map<string, T> {
  return new Map(Array.isArray(value) ? (value as Array<[string, T]>) : []);
}

function toStoredFileMetadata(
  metadata: PluginFileMetadata | null | undefined
): PluginStoredFileMetadata | null {
  if (!metadata) return null;
  return {
    fileExtension: metadata.fileExtension,
    fileId: metadata.attachmentId,
    filename: metadata.filename,
    mediaType: metadata.mediaType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
  };
}

function remoteFetch(method: string, bridge: RemoteBridge): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    const normalizedInit = {
      body,
      headers: Array.from(request.headers.entries()),
      method: request.method,
      redirect: request.redirect,
    };
    const value = (await bridge.call(method, [request.url, normalizedInit])) as {
      body: ArrayBuffer;
      headers: Array<[string, string]>;
      status: number;
      statusText: string;
    };
    return new Response(value.body, {
      headers: value.headers,
      status: value.status,
      statusText: value.statusText,
    });
  }) as typeof fetch;
}

function createRemoteSdkRuntime(
  bridge: RemoteBridge,
  snapshot: SandboxWireObject,
): PluginSdkRuntime {
  const emptyStore = {
    getCommands: () => [],
    getResourceType: () => undefined,
    getResourceTypes: () => [],
    getSearchIndexers: () => [],
    getSearchQueries: () => [],
    getVersion: () => 0,
    getView: () => undefined,
    getViews: () => [],
    subscribe: () => () => undefined,
  };
  const host: PluginHostCapabilities = {
    useApiTransport: () => ({
      baseUrl: String(
        (snapshot.api as { baseUrl?: string } | undefined)?.baseUrl ?? "",
      ),
      fetch: useMemo(() => remoteFetch("api.fetch", bridge), [bridge]),
    }),
    useDownloads: () => ({
      save: (input) => bridge.call("downloads.save", [input]).then(() => undefined),
      saveChunks: (input) => saveRemoteChunks(bridge.call, input),
    }),
    useCurrentWorkspace: () => snapshot.currentWorkspace as never,
    useCurrentUser: () => snapshot.currentUser as never,
    useYjsStorageLastEdited: (storage) => {
      const values = snapshot.lastEdited as
        | Array<{
            storageId?: string;
            isLoading?: boolean;
            lastEditedAt?: string | null;
          }>
        | undefined;
      const value = values?.find((entry) => entry.storageId === storage.storageId);
      return {
        isLoading: value?.isLoading === true,
        lastEditedAt: value?.lastEditedAt ? new Date(value.lastEditedAt) : null,
      };
    },
    useFileStorage: () => {
      const download = useCallback(
        (storage: import("./types").ResourceStorageHandle) =>
          bridge.call("attachment.download", [storage.storageId]) as Promise<boolean>,
        [bridge],
      );
      const upload = useCallback(
        async ({ file, storage }: import("./runtime-context").PluginFileStorageUploadInput) => {
          const metadata = (await bridge.call("attachment.upload", [
            {
              bytes: await file.arrayBuffer(),
              filename: file.name,
              mediaType: file.type,
              storageId: storage.storageId,
            },
          ])) as PluginFileMetadata;
          return toStoredFileMetadata(metadata)!;
        },
        [bridge],
      );
      return useMemo(() => ({ download, upload }), [download, upload]);
    },
    useStoredFile: (storageHandle) => {
      const attachments = snapshot.attachments as
        | Array<{
            attachment?: unknown;
            bytes?: ArrayBuffer;
            storageId?: string;
            mediaType?: string;
            metadata?: unknown;
          }>
        | undefined;
      const value = attachments?.find((entry) => entry.storageId === storageHandle.storageId);
      const bytes = value?.bytes;
      const objectUrl = useMemo(
        () =>
          bytes
            ? URL.createObjectURL(new Blob([bytes], { type: value?.mediaType }))
            : null,
        [bytes, value?.mediaType],
      );
      useEffect(
        () => () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        },
        [objectUrl],
      );
      return {
        file: value ? (value.attachment as never) : null,
        metadata: value
          ? toStoredFileMetadata(value.metadata as PluginFileMetadata)
          : null,
        objectUrl,
      };
    },
    useLocale: () => snapshot.locale as never,
    useLunarisContent: () => {
      const value = snapshot.lunarisContent as unknown as {
        activeWorkspaceId: string;
        activeResourceId: string | null;
        activeStorage: import("./types").ResourceStorageHandles;
        agentToolPolicies?: Record<string, "mutation" | "read">;
      };
      return {
        ...value,
        executeAgentTool: (input) => bridge.call("content.executeAgentTool", [input]),
        getAgentToolPolicy: (name) => value.agentToolPolicies?.[name] ?? null,
        listWorkspaces: (input) =>
          bridge.call("content.listWorkspaces", input === undefined ? [] : [input]) as never,
        readYjsStorageJson: (input) => bridge.call("content.readYjsStorageJson", [input]),
        searchResources: (input) => bridge.call("content.searchResources", [input]) as never,
      };
    },
    useOrgMembersMap: () => {
      const value = snapshot.members as {
        isLoading: boolean;
        items: Array<[string, unknown]>;
      };
      return { isLoading: value.isLoading, map: entriesMap(value.items) } as never;
    },
    usePluginFetch: () => useMemo(() => remoteFetch("plugin.fetch", bridge), [bridge]),
    useWorkspaceChildrenMap: () =>
      new Map(
        Array.isArray(snapshot.workspaceChildren)
          ? (snapshot.workspaceChildren as never)
          : [],
      ),
    useWorkspaceResourceActions: () => ({
      createResource: (input) =>
        bridge.call("resources.create", [input]) as never,
      deleteResource: (resourceId) =>
        bridge.call("resources.delete", [resourceId]) as Promise<void>,
      renameResource: (resourceId, name) =>
        bridge.call("resources.rename", [resourceId, name]) as Promise<void>,
      reorderResources: (parentId, orderedResourceIds) =>
        bridge.call("resources.reorder", [
          parentId,
          orderedResourceIds,
        ]) as Promise<void>,
      touchResource: (resourceId) =>
        bridge.call("resources.touch", [resourceId]) as Promise<void>,
    }),
    useWorkspaceResourceBreadcrumb: (resourceId) => {
      const resources = entriesMap<Record<string, unknown>>(snapshot.resources);
      const result: Array<Record<string, unknown>> = [];
      let item = resources.get(resourceId);
      while (item) {
        result.unshift({
          id: item.id,
          isLast: result.length === 0,
          name: item.name ?? "Untitled",
          resourceTypeId: item.resourceTypeId ?? "lunaris.folder",
        });
        item = typeof item.parentId === "string" ? resources.get(item.parentId) : undefined;
      }
      return result as never;
    },
    useWorkspaceResourceName: (resourceId) => {
      const resources = entriesMap<Record<string, unknown>>(snapshot.resources);
      return String(resources.get(resourceId)?.name ?? "Untitled");
    },
    useWorkspaceResourcesMap: () => entriesMap(snapshot.resources),
    useWorkspaceTrashMap: () => entriesMap(snapshot.resourceTrash),
    useResourceReadContext: () =>
      createRemoteResourceReadContext((method, args) => bridge.call(method, args)),
    useStableInitialLoading: ({ dataEmpty, extraGate = false }) => {
      if (!dataEmpty) return { showEmpty: false, showSkeleton: false };
      if (extraGate) return { showEmpty: false, showSkeleton: true };
      return snapshot.stableEmpty as never;
    },
    useOrganizationAccess: () => snapshot.access as never,
    useOrganizationNavigation: () => ({
      closeViewInstances: (viewInstanceIds) =>
        void bridge.call("navigation.closeViewInstances", [viewInstanceIds]),
      navigateToWorkspaceResource: (id) =>
        void bridge.call("navigation.navigateToWorkspaceResource", [id]),
      openEntityReference: (reference) =>
        bridge.call("navigation.openEntityReference", [reference]) as Promise<boolean>,
      openResource: (input) => void bridge.call("navigation.openResource", [input]),
      openResourceInNewWindow: (input) =>
        bridge.call("navigation.openResourceInNewWindow", [input]) as Promise<boolean>,
      openView: (input) => {
        void bridge.call("navigation.openView", [input]);
        return true;
      },
      openViewInNewWindow: (input) =>
        bridge.call("navigation.openViewInNewWindow", [input]) as Promise<boolean>,
      setViewInstanceTitle: (viewInstanceId, title) =>
        void bridge.call("navigation.setViewInstanceTitle", [
          viewInstanceId,
          title,
        ]),
    }),
    useYjsStorageUpdateRows: () => (storage) =>
      bridge.call("yjs.getUpdateRows", [storage.storageId]) as never,
  };
  return {
    contributions: {
      ...emptyStore,
      getCommands: () => [],
      getWorkspaceStorage: () => undefined,
      getWorkspaceStorages: () => [],
      getResourceType: () => undefined,
      getResourceTypes: () => [],
      getView: () => undefined,
      getViews: () => [],
    },
    data: {
      useResourcePresence: () => useRemoteResourcePresence(bridge),
      useResourceAwareness: (_extensionId, channel, options) => useRemoteResourceAwareness(bridge, channel, options),
      useYjsAwareness: (storage, workspaceId, options) => useRemoteYjsAwareness(bridge, storage?.storageId, workspaceId, options),
      useKeyValue: <T,>(storageId: string, key: string) => {
        const storage = snapshot.storage as
          | {
              slots?: Record<string, {
                isFetching?: boolean;
                isLoading?: boolean;
                items?: Array<[string, unknown]>;
              }>;
            }
          | undefined;
        const slot = storage?.slots?.[storageId];
        const values = entriesMap<T>(slot?.items);
        return {
          isFetching: slot?.isFetching === true,
          isLoading: slot?.isLoading === true,
          remove: () => bridge.call("storage.remove", [storageId, key]).then(() => undefined),
          set: async (value: T) => {
            await bridge.call("storage.set", [storageId, key, value]);
          },
          value: values.get(key) ?? null,
        };
      },
      useWorkspaceKeyValue: <T,>(pluginId: string, storageId: string, key: string) => {
        const qualifiedId = `${pluginId}:${storageId}`;
        return createRemoteSdkRuntime(bridge, snapshot).data.useKeyValue<T>(qualifiedId, key);
      },
      useReadyYjsStorage: (storageHandle, workspaceId, options) => {
        const id = storageHandle?.storageId;
        const yDoc = useRemotePresenceDocument(bridge, JSON.stringify([workspaceId, id]));
        const [hydratedDoc, setHydratedDoc] = useState<Doc | null>(null);
        const [error, setError] = useState<Error | null>(null);
        const yjs = snapshot.yjs as
          | Array<{
              storageId?: string;
              persistenceState?: "error" | "idle" | "persisting";
              workspaceId?: string;
              update?: ArrayBuffer;
              incremental?: boolean;
              available?: boolean;
              revision?: number;
              epoch?: string;
            }>
          | undefined;
        const remote = yjs?.find((entry) => entry.storageId === id);
        const enabled = options?.enabled !== false && Boolean(id && workspaceId);
        const hasRemoteDocument =
          enabled &&
          remote?.storageId === id &&
          remote?.workspaceId === workspaceId &&
          (remote?.incremental ? remote.available === true : remote?.update instanceof ArrayBuffer);
        useEffect(() => {
          setError(null);
          setHydratedDoc(null);
        }, [yDoc]);
        const sync = useMemo(() => createYjsReplicaSync(
          yDoc,
          (vector, cursor) => bridge.call("yjs.sync", [id, vector, cursor ?? null]),
          () => { setError(null); setHydratedDoc(yDoc); },
          setError,
          update => bridge.call("yjs.applyUpdate", [id, update]),
        ), [bridge, id, yDoc]);
        useEffect(() => () => sync.dispose(), [sync]);
        useEffect(() => {
          if (!hasRemoteDocument) return;
          if (remote?.incremental) { void sync.request(); return; }
          try {
            const update = remote?.update;
            if (!(update instanceof ArrayBuffer)) throw new Error("Invalid Yjs synchronization response");
            applyUpdateV2(yDoc, new Uint8Array(update), "host");
            setError(null);
            setHydratedDoc(yDoc);
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
          }
        }, [hasRemoteDocument, remote?.incremental, remote?.revision, remote?.epoch, remote?.update, sync, yDoc]);
        const ready = hasRemoteDocument && hydratedDoc === yDoc && !error;
        useEffect(() => {
          if (!hasRemoteDocument || !id) return;
          const onUpdate = (update: Uint8Array, origin: unknown) => {
            if (origin === "host") return;
            const bytes = update.buffer.slice(
              update.byteOffset,
              update.byteOffset + update.byteLength,
            );
            void bridge.call("yjs.applyUpdate", [id, bytes]).then(() => {
              sync.acknowledge(update);
            }).catch((nextError) => {
              setError(
                nextError instanceof Error ? nextError : new Error(String(nextError)),
              );
              if (remote?.incremental) void sync.request();
            });
          };
          yDoc.on("updateV2", onUpdate);
          return () => yDoc.off("updateV2", onUpdate);
        }, [bridge, hasRemoteDocument, id, remote?.incremental, sync, yDoc]);

        const yProvider = useMemo<PluginYjsProvider | null>(() => {
          if (!enabled || !id) return null;
          const getPersistenceState = () => {
            const current = bridge.getSnapshot().yjs as
              | Array<{ storageId?: string; persistenceState?: PluginYjsPersistenceState }>
              | undefined;
            return current?.find((entry) => entry.storageId === id)?.persistenceState ?? "idle";
          };
          return {
            getPersistenceState,
            subscribePersistenceState: (listener) => {
              let previous = getPersistenceState();
              return bridge.subscribe(() => {
                const next = getPersistenceState();
                if (next === previous) return;
                previous = next;
                listener(next);
              });
            },
            waitForPersistence: () =>
              bridge.call("yjs.waitForPersistence", [id]).then(() => undefined),
          };
        }, [bridge, enabled, id]);
        return {
          error,
          isLoading: enabled && !ready && !error,
          yDoc: ready ? yDoc : null,
          yProvider: ready ? yProvider : null,
        };
      },
    },
    host,
    services: {
      getService: (consumerId, definition) => {
        const state = bridge.getSnapshot().extensionServices as
          | { providers?: Array<{ id: string; methods: string[]; version: string }> }
          | undefined;
        const provider = state?.providers?.find(
          (entry) =>
            entry.id === definition.id &&
            isCompatibleServiceVersion(entry.version, definition.version),
        );
        if (!provider) return undefined;
        const implementation = Object.fromEntries(
          provider.methods.map((method) => [
            method,
            (input: unknown) =>
              bridge.call("services.invoke", [definition.id, method, input]),
          ]),
        );
        return {
          definition,
          implementation,
          providerId: definition.id,
          providerVersion: provider.version,
        } as never;
      },
      getSlotContributions: (_consumerId, slot) => {
        const state = bridge.getSnapshot().extensionServices as
          | {
              slots?: Array<{
                contributorId: string;
                contributorVersion: string;
                id: string;
                metadata: Record<string, unknown>;
                registrationId: string;
                serviceId: string;
                serviceVersion: string;
                slotId: string;
              }>;
            }
          | undefined;
        return (state?.slots ?? [])
          .filter(
            (entry) =>
              entry.serviceId === slot.serviceId &&
              isCompatibleServiceVersion(
                slot.serviceVersion,
                entry.serviceVersion,
              ) &&
              entry.slotId === slot.id,
          )
          .map((entry) => ({
            contributorId: entry.contributorId,
            contributorVersion: entry.contributorVersion,
            id: entry.id,
            invoke: (input: unknown) =>
              bridge.call("services.invokeSlot", [entry.registrationId, input]),
            metadata: entry.metadata,
            slot,
          })) as never;
      },
      getVersion: () =>
        Number(
          (bridge.getSnapshot().extensionServices as { version?: number } | undefined)
            ?.version ?? 0,
        ),
      invokeService: (_consumerId, serviceId, method, input) =>
        bridge.call("services.invoke", [serviceId, method, input]) as never,
      invokeSlot: (_consumerId, registrationId, input) =>
        bridge.call("services.invokeSlot", [registrationId, input]) as never,
      snapshot: () =>
        (bridge.getSnapshot().extensionServices as never),
      subscribe: bridge.subscribe,
    },
  };
}

function SandboxProviders({
  bridge,
  children,
  pluginId,
  permissions,
  onReady,
}: {
  bridge: RemoteBridge;
  children?: ReactNode;
  pluginId: string;
  permissions: PluginDefinition["manifest"]["permissions"];
  onReady(): void;
}) {
  const snapshot = useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot,
  );
  const runtime = useMemo(
    () => createRemoteSdkRuntime(bridge, snapshot),
    [bridge, snapshot],
  );
  useLayoutEffect(() => {
    const environment = snapshot.environment as
      | { colorScheme?: string; cssVariables?: Record<string, string>; reducedMotion?: boolean }
      | undefined;
    document.documentElement.style.colorScheme = environment?.colorScheme ?? "";
    document.documentElement.dataset.reducedMotion = environment?.reducedMotion
      ? "true"
      : "false";
    for (const [name, value] of Object.entries(environment?.cssVariables ?? {})) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [snapshot]);
  useLayoutEffect(() => {
    onReady();
  }, [onReady]);
  return createElement(
    ExtensionSdkProvider,
    {
      children: createElement(
        ExtensionScopeProvider,
        { extensionId: pluginId, permissions },
        children,
      ),
      runtime,
    },
  );
}

function SandboxRenderer({
  handler,
  hostCall,
  params,
}: {
  handler: Handler;
  hostCall: SandboxHostCall;
  params: unknown;
}) {
  return handler.invoke(params, hostCall) as ReactNode;
}

function cloneJson<T>(value: T, label: string): T {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error(`${label} is not JSON serializable`);
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`${label} must be JSON serializable`, { cause: error });
  }
}

function createRemoteBridge(
  call: RemoteBridge["call"],
  initialSnapshot: SandboxWireObject,
): RemoteBridge {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  return {
    call,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}

function assertSerializableIcon(
  value: unknown,
  label: string,
): asserts value is IconSvgObject {
  assertSandboxIcon(value, label);
  cloneJson(value, label);
}

function commandLeaf(command: ResourceCommandItem): command is ResourceCommand {
  return !Array.isArray(command.children);
}

function createRemoteResourceReadContext(
  hostCall: SandboxHostCall,
): PluginResourceReadContext {
  return {
    getWorkspaceResource: (id) =>
      hostCall("data.getWorkspaceResource", [id]) as never,
    getWorkspaceResourceChildren: (id) =>
      hostCall("data.getWorkspaceResourceChildren", [id]) as never,
    getYjsStorageUpdates: (storage) =>
      hostCall("data.getYjsStorageUpdates", [storage]) as never,
    resolveResource: (id) =>
      hostCall("data.resolveResource", [id]) as never,
  };
}

function createRemoteResourceCreateContext(
  parentId: string,
  hostCall: SandboxHostCall,
): ResourceCreationContext {
  return {
    createResource: (input = {}) =>
      hostCall("resourceCreation.createResource", [input]) as ReturnType<
        ResourceCreationContext["createResource"]
      >,
    deleteResource: (resourceId) =>
      hostCall("resourceCreation.deleteResource", [resourceId]) as Promise<void>,
    parentId,
    uploadFile: async ({ file, storage }) => {
      const metadata = await hostCall("resourceCreation.file.upload", [
        {
          bytes: await file.arrayBuffer(),
          filename: file.name,
          mediaType: file.type,
          storage,
        },
      ]);
      return metadata as PluginStoredFileMetadata;
    },
  };
}

interface SandboxResourcePayloadContext {
  resourceId: string;
  storage: Record<
    string,
    | { documentUpdate: ArrayBuffer; kind: "yjs" }
    | { kind: "key-value"; values: Record<string, JsonValue> }
    | { kind: "file"; metadata: PluginStoredFileMetadata | null }
  >;
}

function createResourcePayloadContext(input: unknown) {
  const value = input as Partial<SandboxResourcePayloadContext> | undefined;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.resourceId !== "string" ||
    !value.storage ||
    typeof value.storage !== "object"
  ) {
    throw new Error("Invalid resource payload context");
  }
  const documents: Doc[] = [];
  const storage = Object.fromEntries(
    Object.entries(value.storage).map(([name, entry]) => {
      if (entry.kind !== "yjs") return [name, structuredClone(entry)];
      if (!(entry.documentUpdate instanceof ArrayBuffer)) {
        throw new Error(`Invalid Yjs storage payload: ${name}`);
      }
      const document = new Doc();
      applyUpdateV2(document, new Uint8Array(entry.documentUpdate));
      documents.push(document);
      return [name, { document, kind: "yjs" as const }];
    }),
  );
  return {
    context: { resourceId: value.resourceId, storage },
    documents,
  };
}

function serializePayloadStorage(
  context: ReturnType<typeof createResourcePayloadContext>["context"],
) {
  return Object.fromEntries(
    Object.entries(
      context.storage as Record<string, ResourcePayloadStorage>,
    ).map(([name, entry]) => {
      if (entry.kind !== "yjs") return [name, structuredClone(entry)];
      const update = encodeStateAsUpdateV2(entry.document);
      return [
        name,
        {
          documentUpdate: update.buffer.slice(
            update.byteOffset,
            update.byteOffset + update.byteLength,
          ),
          kind: "yjs",
        },
      ];
    }),
  );
}

function serializeCommands(
  contributionId: string,
  commands: readonly ResourceCommandItem[],
  handlers: Map<string, Handler>,
): SerializedSandboxCommand[] {
  return commands.map((command) => {
    if (commandLeaf(command) && command.iconElement) {
      throw new Error(
        `External command "${contributionId}:${command.id}" cannot use iconElement`,
      );
    }
    if (command.icon) {
      assertSerializableIcon(
        command.icon,
        `Command "${contributionId}:${command.id}" icon`,
      );
    }
    if (!commandLeaf(command)) {
      return {
        children: serializeCommands(contributionId, command.children, handlers),
        group: command.group,
        icon: command.icon,
        id: command.id,
        labelKey: command.labelKey,
      };
    }
    const handler = sandboxHandlerKey("command", contributionId, command.id);
    handlers.set(handler, {
      invoke: (input, hostCall) => {
        const value = input as Record<string, unknown>;
        return command.onExecute({
          ...value,
          resourceReadContext: createRemoteResourceReadContext(hostCall),
          downloadFile: (storage: ResourceStorageHandle) =>
            hostCall("command.downloadFile", [storage]) as Promise<boolean>,
          openView: (view: Parameters<ResourceCommand["onExecute"]>[0]["openView"] extends (
            input: infer T,
          ) => void ? T : never) => {
            void hostCall("command.openView", [view]);
          },
          waitForYjsPersistence: (storage: ResourceStorageHandle) =>
            hostCall("command.waitForYjsPersistence", [storage]) as Promise<void>,
        } as never);
      },
    });
    return {
      group: command.group,
      handler,
      icon: command.icon,
      id: command.id,
      labelKey: command.labelKey,
      variant: command.variant,
    };
  });
}

function serializeResourceType(
  resourceType: ResourceTypeContribution,
  handlers: Map<string, Handler>,
): SerializedSandboxResourceType {
  assertSerializableIcon(
    resourceType.icon,
    `Resource type "${resourceType.resourceTypeId}" icon`,
  );

  const createHandler = resourceType.createInWorkspace
    ? sandboxHandlerKey("create", resourceType.resourceTypeId)
    : undefined;
  if (createHandler && resourceType.createInWorkspace) {
    handlers.set(createHandler, {
      invoke: (input, hostCall) => {
        const parentId = (input as { parentId?: unknown })?.parentId;
        if (typeof parentId !== "string") throw new Error("Parent ID is invalid");
        return resourceType.createInWorkspace?.(
          createRemoteResourceCreateContext(parentId, hostCall),
        );
      },
    });
  }

  const storage = Object.fromEntries(
    Object.entries(resourceType.storage).map(([name, slot]) => {
      if (!("initialize" in slot) || !slot.initialize) {
        return [name, { kind: slot.kind }];
      }
      const handler = sandboxHandlerKey(
        "initialize",
        resourceType.resourceTypeId,
        name,
      );
      handlers.set(handler, {
        invoke: async (input) => {
          if (slot.kind === "key-value") {
            return slot.initialize?.(input as never);
          }
          const document = new Doc();
          try {
            await slot.initialize?.(document, input as never);
            const update = encodeStateAsUpdateV2(document);
            return update.buffer.slice(
              update.byteOffset,
              update.byteOffset + update.byteLength,
            );
          } finally {
            document.destroy();
          }
        },
      });
      return [name, { initializeHandler: handler, kind: slot.kind }];
    }),
  );

  const readHandler = sandboxHandlerKey("payload-read", resourceType.resourceTypeId);
  handlers.set(readHandler, {
    invoke: async (input) => {
      const { context, documents } = createResourcePayloadContext(input);
      try {
        return await resourceType.schema.read(context);
      } finally {
        for (const document of documents) document.destroy();
      }
    },
  });

  const writeHandler = resourceType.schema.write
    ? sandboxHandlerKey("payload-write", resourceType.resourceTypeId)
    : undefined;
  if (writeHandler && resourceType.schema.write) {
    handlers.set(writeHandler, {
      invoke: async (input) => {
        const value = input as { context: unknown; payload: unknown };
        const { context, documents } = createResourcePayloadContext(value.context);
        try {
          await resourceType.schema.write?.(value.payload, context);
          return serializePayloadStorage(context);
        } finally {
          for (const document of documents) document.destroy();
        }
      },
    });
  }

  const migrationHandlers =
    resourceType.schema.migrations?.map((migration) => {
      const handler = sandboxHandlerKey(
        "migration",
        resourceType.resourceTypeId,
        String(migration.from),
      );
      handlers.set(handler, { invoke: (input) => migration.migrate(input) });
      return { from: migration.from, handler, to: migration.to };
    }) ?? [];
  const validationHandlers = Object.fromEntries(
    Object.entries(resourceType.schema.versions).map(([version, schema]) => {
      const handler = sandboxHandlerKey(
        "validate",
        resourceType.resourceTypeId,
        version,
      );
      handlers.set(handler, {
        invoke: (input) => schema["~standard"].validate(input),
      });
      return [version, handler];
    }),
  );

  return {
    createHandler,
    defaultViewId: resourceType.defaultViewId,
    hierarchy: resourceType.hierarchy,
    icon: resourceType.icon as IconSvgObject,
    name: resourceType.name,
    resourceTypeId: resourceType.resourceTypeId,
    schema: {
      currentVersion: resourceType.schema.currentVersion,
      id: resourceType.schema.id,
      migrationHandlers,
      readHandler,
      validationHandlers,
      writeHandler,
    },
    storage,
    type: "resource-type",
  };
}

function serializeResourceTarget(target: ResourceTypeTarget) {
  return {
    resourceTypeIds: target.resourceTypeIds
      ? [...target.resourceTypeIds]
      : undefined,
    schemas: target.schemas ? [...target.schemas] : undefined,
  };
}

function serializeDefinition(
  definition: PluginDefinition,
  activation: ActivatedPluginContributions,
  handlers: Map<string, Handler>,
): SerializedSandboxPluginDefinition {
  const contributions: SerializedSandboxPluginDefinition["contributions"] = [];
  for (const resourceType of getResourceTypeContributions(activation)) {
    contributions.push(serializeResourceType(resourceType, handlers));
  }
  for (const workspaceStorage of getWorkspaceStorageContributions(activation)) {
    contributions.push(workspaceStorage);
  }
  for (const view of getViewContributions(activation)) {
    assertSerializableIcon(view.icon, `View "${view.viewId}" icon`);
    const renderer = sandboxHandlerKey("renderer", view.viewId);
    handlers.set(renderer, {
      invoke: (input, hostCall) =>
        view.renderer(
          view.target.kind === "resource"
            ? ({
                ...(input as object),
                reportReady: () => {
                  void hostCall("renderer.reportReady").catch(() => undefined);
                },
              } as never)
            : (input as never),
        ),
    });
    let statusBar: string | undefined;
    if (view.statusBar) {
      const renderStatusBar = view.statusBar;
      statusBar = sandboxHandlerKey("status-bar", view.viewId);
      handlers.set(statusBar, {
        invoke: (input) => renderStatusBar(input as ResourceViewStatusProps),
      });
    }
    contributions.push({
      icon: view.icon as IconSvgObject,
      name: view.name,
      renderer,
      rendererSandbox: view.rendererSandbox,
      storageRequirements:
        view.target.kind === "resource"
          ? { ...(view as ResourceViewDefinition).storageRequirements }
          : undefined,
      statusBar,
      target:
        view.target.kind === "standalone"
          ? { ...view.target }
          : {
              ...view.target,
              ...serializeResourceTarget(view.target),
            },
      type: "view",
      viewId: view.viewId,
    });
  }
  for (const command of getResourceCommandContributions(activation)) {
    contributions.push({
      ...serializeResourceTarget(command),
      commands: serializeCommands(command.id, command.commands, handlers),
      id: command.id,
      type: "resource-command",
    });
  }
  for (const provider of activation.serviceProviders) {
    const registeredHandlers = Object.fromEntries(
      provider.definition.methods.map((method) => {
        const handler = sandboxHandlerKey("service", provider.definition.id, method);
        handlers.set(handler, {
          invoke: (input) => provider.implementation[method]?.(input as never),
        });
        return [method, handler];
      }),
    );
    contributions.push({
      handlers: registeredHandlers,
      id: provider.definition.id,
      methods: [...provider.definition.methods],
      type: "service-provider",
      version: provider.definition.version,
    });
  }
  for (const registration of activation.slotContributions) {
    const handler = sandboxHandlerKey(
      "slot",
      registration.slot.serviceId,
      registration.contribution.id,
    );
    handlers.set(handler, {
      invoke: (input) => registration.contribution.invoke(input as never),
    });
    contributions.push({
      contributorId: definition.manifest.id,
      handler,
      id: registration.contribution.id,
      metadata: registration.contribution.metadata,
      serviceId: registration.slot.serviceId,
      serviceVersion: registration.slot.serviceVersion,
      slotId: registration.slot.id,
      type: "service-slot",
    });
  }
  for (const indexer of getSearchIndexerContributions(activation)) {
    const handler = sandboxHandlerKey("search-indexer", indexer.id);
    handlers.set(handler, {
      invoke: (input, hostCall) =>
        indexer.extractText(input as never, {
          readFile: (storage) =>
            hostCall("searchIndexer.readFile", [storage]) as ReturnType<
              SearchIndexerContext["readFile"]
            >,
        }),
    });
    contributions.push({
      ...serializeResourceTarget(indexer),
      handler,
      id: indexer.id,
      type: "search-indexer",
    });
  }
  for (const provider of getSearchQueryContributions(activation)) {
    const queryHandler = sandboxHandlerKey("search-query", provider.id);
    const openHandler = sandboxHandlerKey("search-query-open", provider.id);
    handlers.set(queryHandler, {
      invoke: (input, hostCall) =>
        provider.query(input as never, {
          fetch: remoteFetch("searchQuery.fetch", {
            call: hostCall,
          } as RemoteBridge),
        } satisfies SearchQueryContext),
    });
    handlers.set(openHandler, {
      invoke: (input, hostCall) =>
        provider.open(input as never, {
          openView: (view) => {
            void hostCall("searchQuery.openView", [view]);
          },
        } satisfies SearchQueryOpenContext),
    });
    contributions.push({
      id: provider.id,
      openHandler,
      queryHandler,
      type: "search-query",
    });
  }
  return cloneJson(
    {
      locales:
        Object.keys(activation.locales).length === 0
          ? undefined
          : (cloneSandboxJsonValue(
              activation.locales,
              `Extension "${definition.manifest.id}" locales`,
            ) as SerializedSandboxPluginDefinition["locales"]),
      manifest: definition.manifest,
      contributions,
    },
    `Extension "${definition.manifest.id}" definition`,
  );
}

function toError(error: unknown): { message: string; name: string } {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error), name: "Error" };
}

function sandboxError(error: { message: string; name: string }): Error {
  const value = new Error(error.message);
  value.name = error.name;
  return value;
}

function startRegisteredPlugin(
  pluginId: string,
  definition: PluginDefinition,
): Promise<SandboxRegistrationResult> {
  if (definition.manifest.id !== pluginId) {
    throw new Error(
      `Extension module ID "${definition.manifest.id}" does not match "${pluginId}"`,
    );
  }
  const handlers = new Map<string, Handler>();
  const activation = preparePluginActivation(definition);
  const registration = activation.then(
    (): SandboxRegistrationResult => ({}),
    (error): SandboxRegistrationResult => ({ error: toError(error) }),
  );
  let connected = false;
  let root: Root | undefined;
  let renderBridge: RemoteBridge | undefined;
  let renderRequestId: string | undefined;
  const pendingHostCalls = new Map<
    string,
    {
      reject(error: Error): void;
      resolve(value: unknown): void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  window.addEventListener("message", async (event: MessageEvent) => {
    if (
      connected ||
      event.data?.type !== CONNECT_MESSAGE ||
      event.data?.pluginId !== pluginId ||
      event.ports.length !== 1
    ) {
      return;
    }
    connected = true;
    const port = event.ports[0];
    if (!port) return;
    port.onmessage = async ({ data }: MessageEvent<SandboxHostRequest>) => {
      let request: SandboxHostRequest | undefined;
      try {
        if (
          !data ||
          typeof data !== "object" ||
          typeof (data as { id?: unknown }).id !== "string" ||
          ![
            "activate",
            "dispose",
            "host-result",
            "invoke",
            "render",
            "snapshot",
          ].includes(
            String((data as { type?: unknown }).type),
          )
        ) {
          throw new Error("Malformed sandbox RPC request");
        }
        request = cloneSandboxWireValue(
          data,
          "Sandbox RPC request",
        ) as SandboxHostRequest;
        if (request.type === "host-result") {
          const pending = pendingHostCalls.get(request.id);
          if (!pending) return;
          pendingHostCalls.delete(request.id);
          clearTimeout(pending.timeout);
          if (request.error) pending.reject(sandboxError(request.error));
          else pending.resolve(request.value);
          return;
        }
        if (request.type === "dispose") {
          try {
            root?.unmount();
            await (await activation).dispose();
            const message: SandboxPluginMessage = {
              id: request.id,
              type: "ready",
            };
            port.postMessage(message);
          } catch (error) {
            const message: SandboxPluginMessage = {
              error: toError(error),
              id: request.id,
              type: "failure",
            };
            port.postMessage(message);
          } finally {
            for (const pending of pendingHostCalls.values()) {
              clearTimeout(pending.timeout);
              pending.reject(new Error("Extension sandbox disposed"));
            }
            pendingHostCalls.clear();
            port.close();
          }
          return;
        }
        if (request.type === "activate") {
          await (await activation).start();
          const message: SandboxPluginMessage = {
            id: request.id,
            type: "ready",
          };
          port.postMessage(message);
          return;
        }
        if (request.type === "snapshot") {
          if (!request.host || typeof request.host !== "object") {
            throw new Error("Malformed sandbox snapshot");
          }
          if (request.id !== renderRequestId || !renderBridge) {
            throw new Error("Unknown sandbox render subscription");
          }
          renderBridge.update(request.host);
          return;
        }
        const parentId = request.id;
        const hostCall = (method: string, args: unknown[] = []) => {
          const clonedArgs = cloneSandboxWireValue(
            args,
            `Host call "${method}" arguments`,
          ) as never;
          return new Promise<unknown>((resolve, reject) => {
            const id = crypto.randomUUID();
            const timeout = setTimeout(() => {
              pendingHostCalls.delete(id);
              reject(new Error(`Extension sandbox host call timed out: ${method}`));
            }, PLUGIN_SANDBOX_RPC_TIMEOUT_MS);
            pendingHostCalls.set(id, { reject, resolve, timeout });
            const message: SandboxPluginMessage = {
              args: clonedArgs,
              id,
              method,
              parentId,
              type: "host-call",
            };
            try {
              port.postMessage(message);
            } catch (error) {
              clearTimeout(timeout);
              pendingHostCalls.delete(id);
              reject(error);
            }
          });
        };
        if (request.type === "render") {
          if (
            typeof request.renderer !== "string" ||
            !request.params ||
            typeof request.params !== "object" ||
            !request.host ||
            typeof request.host !== "object"
          ) {
            throw new Error("Malformed sandbox render request");
          }
          const handler = handlers.get(request.renderer);
          if (!handler) throw new Error(`Unknown renderer: ${request.renderer}`);
          const container = document.getElementById("root");
          if (!container) throw new Error("Sandbox root is missing");
          root ??= createRoot(container);
          renderRequestId = request.id;
          const readyMessage: SandboxPluginMessage = { id: request.id, type: "ready" };
          renderBridge = createRemoteBridge(hostCall, request.host);
          root.render(
            createElement(
              SandboxProviders,
              {
                bridge: renderBridge,
                children: createElement(SandboxRenderer, {
                  handler,
                  hostCall,
                  params: request.params,
                }),
                pluginId,
                permissions: definition.manifest.permissions,
                onReady: () => {
                  port.postMessage(readyMessage);
                },
              },
            ),
          );
          return;
        }
        if (request.type !== "invoke" || typeof request.handler !== "string") {
          throw new Error("Unknown sandbox RPC request");
        }
        const handler = handlers.get(request.handler);
        if (!handler) throw new Error(`Unknown handler: ${request.handler}`);
        const value = await handler.invoke(
          request.input ?? request.commandContext,
          hostCall,
        );
        const message: SandboxPluginMessage = {
          id: request.id,
          type: "result",
          value:
            value === undefined
              ? undefined
              : (cloneSandboxWireValue(value, "Sandbox RPC result") as never),
        };
        port.postMessage(message);
      } catch (error) {
        const message: SandboxPluginMessage = {
          error: toError(error),
          id:
            request?.id ??
            (data &&
            typeof data === "object" &&
            typeof (data as { id?: unknown }).id === "string"
              ? (data as { id: string }).id
              : "invalid"),
          type: "failure",
        };
        port.postMessage(message);
      }
    };
    port.start();
    try {
      const result = await registration;
      if (result.error) throw sandboxError(result.error);
      const prepared = await activation;
      const message: SandboxPluginMessage = {
        definition: serializeDefinition(definition, prepared, handlers),
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      };
      port.postMessage(message);
    } catch (error) {
      const message: SandboxPluginMessage = {
        error: toError(error),
        type: "registration-failed",
      };
      port.postMessage(message);
      port.close();
    }
  });
  return registration;
}

export function installExternalPluginSandboxRuntime(): SandboxRuntimeV6 {
  if (globalThis.__LUNARIS_PLUGIN_SANDBOX_V6__) {
    return globalThis.__LUNARIS_PLUGIN_SANDBOX_V6__;
  }
  let registered = false;
  const runtime = Object.freeze({
    register(pluginId: string, definition: PluginDefinition) {
      if (registered) throw new Error(`Duplicate extension registration: ${pluginId}`);
      registered = true;
      return startRegisteredPlugin(pluginId, definition);
    },
  });
  Object.defineProperty(globalThis, "__LUNARIS_PLUGIN_SANDBOX_V6__", {
    configurable: false,
    enumerable: false,
    value: runtime,
    writable: false,
  });
  return runtime;
}
