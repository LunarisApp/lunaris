import {
  defineResourceType,
  definePlugin,
  definePluginService,
  defineView,
  isPluginApiRangeSupported,
  sandboxHandlerKey,
  isSupportedSandboxProtocol,
  type ResourceCommandContext,
  type ResourceCommandItem,
  type ResourceCreationContext,
  type ResourceCreateResult,
  type ResourcePayloadContext,
  type ResourceStorageHandle,
  type ResourceStorageHandles,
  type ResourceStorageKind,
  type ResourceTypeDefinition,
  type ResourceViewProps,
  type ResourceViewStatusProps,
  type SearchIndexerContext,
  type SearchIndexerInput,
  type SearchQueryContribution,
  type SearchQueryContext,
  type SearchQueryOpenContext,
  type SearchQueryResult,
  type StandaloneViewProps,
  type ViewTarget,
  type PluginManifest,
  type PluginPermission,
  type PluginDefinition,
  type SerializedSandboxCommand,
  type SerializedSandboxResourceCommand,
  type SerializedSandboxResourceType,
  type SerializedSandboxSearchIndexer,
  type SerializedSandboxSearchQuery,
  type SerializedSandboxPluginDefinition,
  type SerializedSandboxView,
} from "@lunarisapp/plugin-sdk";
import {
  assertSandboxIcon,
  cloneSandboxJsonValue,
} from "@lunarisapp/plugin-sdk/internal";
import {
  parseExtensionMarketplace,
  parsePluginReleaseDescriptor,
  type ExtensionMarketplace,
  type MarketplaceDescriptorReference,
  type PluginReleaseDescriptor,
} from "@lunarisapp/plugin-sdk/marketplace";
import {
  OFFICIAL_EXTENSION_MARKETPLACE_URL,
  fetchAndCacheJson,
  readCachedJson,
  type PlatformPlugins,
} from "@repo/platform";
import { verifiedAsset } from "./artifacts";
import {
  ExternalPluginSandboxSession,
  SandboxedExtensionRenderer,
  type SandboxRequestCapabilities,
} from "./sandbox";
import { applyUpdateV2, encodeStateAsUpdateV2 } from "yjs";
import { createElement } from "react";

export const MAX_PLUGIN_SCRIPT_BYTES = 10 * 1024 * 1024;
export const MAX_PLUGIN_STYLE_BYTES = 2 * 1024 * 1024;
export const MAX_PLUGIN_ICON_BYTES = 256 * 1024;
export const MAX_PLUGIN_DESCRIPTOR_BYTES = 1024 * 1024;

type ResourceViewTarget = Extract<ViewTarget, { kind: "resource" }>;
type StandaloneViewTarget = Extract<ViewTarget, { kind: "standalone" }>;

export interface ExternalPluginReference {
  descriptor: MarketplaceDescriptorReference;
  id: string;
  version: string;
}

export interface LoadedExternalPlugin {
  dispose: () => void;
  plugin: PluginDefinition;
}

async function verifiedReleaseAssets(
  descriptor: PluginReleaseDescriptor,
  plugins: PlatformPlugins,
  options?: { allowNetwork?: boolean },
) {
  const [script, style] = await Promise.all([
    verifiedAsset(descriptor.script, MAX_PLUGIN_SCRIPT_BYTES, plugins, options),
    descriptor.style
      ? verifiedAsset(descriptor.style, MAX_PLUGIN_STYLE_BYTES, plugins, options)
      : undefined,
    descriptor.icon
      ? verifiedAsset(descriptor.icon, MAX_PLUGIN_ICON_BYTES, plugins, options)
      : undefined,
  ]);
  return { script, style };
}

export async function fetchPluginCatalog(
  plugins: PlatformPlugins,
  url = OFFICIAL_EXTENSION_MARKETPLACE_URL,
): Promise<ExtensionMarketplace> {
  return fetchAndCacheJson(url, plugins, (value) =>
    parseExtensionMarketplace(value, url),
  );
}

export async function readCachedPluginCatalog(
  plugins: PlatformPlugins,
  url = OFFICIAL_EXTENSION_MARKETPLACE_URL,
): Promise<ExtensionMarketplace | null> {
  return readCachedJson(url, plugins, (value) =>
    parseExtensionMarketplace(value, url),
  );
}

export async function loadExternalPluginDescriptor(
  reference: ExternalPluginReference,
  plugins: PlatformPlugins,
  { allowNetwork = true }: { allowNetwork?: boolean } = {},
): Promise<PluginReleaseDescriptor> {
  const bytes = await verifiedAsset(
    {
      ...reference.descriptor,
      resource: "application/json",
    },
    MAX_PLUGIN_DESCRIPTOR_BYTES,
    plugins,
    { allowNetwork },
  );
  return parsePluginReleaseDescriptor(
    JSON.parse(new TextDecoder().decode(bytes)),
    reference,
    reference.descriptor.url,
  );
}

export async function loadExternalPluginIcon(
  descriptor: PluginReleaseDescriptor,
  plugins: PlatformPlugins,
  { allowNetwork = false }: { allowNetwork?: boolean } = {},
): Promise<Uint8Array | null> {
  if (!descriptor.icon) return null;
  return verifiedAsset(descriptor.icon, MAX_PLUGIN_ICON_BYTES, plugins, {
    allowNetwork,
  });
}

function commandContextValue(context: ResourceCommandContext) {
  return {
    resourceId: context.resourceId,
    resourceName: context.resourceName,
    resourceTypeId: context.resourceTypeId,
    storage: context.storage,
  };
}

function hasPermission(
  manifest: PluginManifest,
  permission: PluginPermission,
): boolean {
  return manifest.permissions.includes(permission);
}

function requirePermission(
  manifest: PluginManifest,
  permission: PluginPermission,
): void {
  if (!hasPermission(manifest, permission)) {
    throw new Error(
      `Extension "${manifest.id}" has not declared permission "${permission}"`,
    );
  }
}

function dataCapabilities(
  context: ResourceCommandContext["resourceReadContext"],
  manifest: PluginManifest,
): SandboxRequestCapabilities {
  if (!hasPermission(manifest, "content.read")) return {};
  return {
    "data.getWorkspaceResource": context.getWorkspaceResource,
    "data.getWorkspaceResourceChildren": context.getWorkspaceResourceChildren,
    "data.getYjsStorageUpdates": context.getYjsStorageUpdates,
    "data.resolveResource": context.resolveResource,
  };
}

function createCapabilities(
  context: ResourceCreationContext,
  manifest: PluginManifest,
): SandboxRequestCapabilities {
  const capabilities: SandboxRequestCapabilities = {
    "resourceCreation.deleteResource": (resourceId: unknown) => {
      if (typeof resourceId !== "string") {
        throw new Error("Invalid created resource ID");
      }
      return context.deleteResource(resourceId);
    },
    "resourceCreation.createResource": (input: unknown) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Invalid create resource input");
      }
      const name = (input as { name?: unknown }).name;
      if (name !== undefined && typeof name !== "string") {
        throw new Error("Invalid created resource name");
      }
      const initialPayload = (input as { initialPayload?: unknown }).initialPayload;
      return context.createResource({
        ...(name === undefined ? {} : { name }),
        ...(initialPayload === undefined
          ? {}
          : { initialPayload: cloneSandboxJsonValue(initialPayload, "Initial payload") as never }),
      });
    },
  };
  if (hasPermission(manifest, "files.write")) {
    capabilities["resourceCreation.file.upload"] = async (input: unknown) => {
      const value = input as {
        bytes?: unknown;
        filename?: unknown;
        mediaType?: unknown;
        storage?: unknown;
      };
      if (
        !(value?.bytes instanceof ArrayBuffer) ||
        typeof value.filename !== "string" ||
        typeof value.mediaType !== "string" ||
        !value.storage || typeof value.storage !== "object"
      ) {
        throw new Error("Invalid create file upload");
      }
      return context.uploadFile({
        file: new File([value.bytes], value.filename, { type: value.mediaType }),
        storage: value.storage as never,
      });
    };
  }
  return capabilities;
}

function assertResourceCreateResult(
  value: unknown,
): asserts value is ResourceCreateResult | null {
  if (value === null) return;
  const result = value as Partial<ResourceCreateResult> | undefined;
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.resourceId !== "string" ||
    typeof result.name !== "string" ||
    !result.storage || typeof result.storage !== "object"
  ) {
    throw new Error("Extension create handler returned an invalid resource");
  }
}

export function assertCommandStorageScope(
  currentStorage: ResourceStorageHandles,
  requestedStorage: ResourceStorageHandle,
  kind: ResourceStorageKind,
): ResourceStorageHandle {
  const storage = Object.values(currentStorage).find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.storageId === requestedStorage?.storageId &&
      requestedStorage?.kind === kind,
  );
  if (!storage) throw new Error(`Command ${kind} storage scope mismatch`);
  return storage;
}

function commandCapabilities(
  context: ResourceCommandContext,
  manifest: PluginManifest,
): SandboxRequestCapabilities {
  const capabilities: SandboxRequestCapabilities = {
    ...dataCapabilities(context.resourceReadContext, manifest),
    "command.openView": context.openView,
    "command.waitForYjsPersistence": (storage: ResourceStorageHandle) =>
      context.waitForYjsPersistence(
        assertCommandStorageScope(context.storage, storage, "yjs"),
      ),
  };
  if (hasPermission(manifest, "files.read")) {
    capabilities["command.downloadFile"] = (storage: ResourceStorageHandle) =>
      context.downloadFile(
        assertCommandStorageScope(context.storage, storage, "file"),
      );
  }
  return capabilities;
}

function proxyCommands(
  session: ExternalPluginSandboxSession,
  manifest: PluginManifest,
  contributionId: string,
  commands: SerializedSandboxCommand[],
): ResourceCommandItem[] {
  return commands.map((command) => {
    if (command.icon) assertSandboxIcon(command.icon, `Command "${command.id}" icon`);
    if (command.children) {
      return {
        children: proxyCommands(session, manifest, contributionId, command.children) as never,
        group: command.group,
        icon: command.icon ?? [],
        id: command.id,
        labelKey: command.labelKey,
      };
    }
    if (!command.handler) throw new Error(`Command "${command.id}" has no handler`);
    if (command.handler !== sandboxHandlerKey("command", contributionId, command.id)) {
      throw new Error(`Command "${command.id}" has a non-canonical handler`);
    }
    return {
      group: command.group,
      icon: command.icon,
      id: command.id,
      labelKey: command.labelKey,
      onExecute: (context) => {
        requirePermission(manifest, "content.read");
        void session.invoke(
          command.handler!,
          commandContextValue(context),
          commandCapabilities(context, manifest),
        );
      },
      variant: command.variant,
    };
  });
}

function assertManifestIdentity(
  expected: PluginManifest,
  actual: PluginManifest,
): void {
  for (const field of [
    "id",
    "version",
    "name",
    "description",
    "longDescription",
    "developer",
    "api",
    "website",
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(`Extension "${expected.id}" module ${field} does not match descriptor`);
    }
  }
  const normalize = (value: unknown) =>
    JSON.stringify(value, (_key, field) =>
      field && typeof field === "object" && !Array.isArray(field)
        ? Object.fromEntries(Object.entries(field).sort())
        : field,
    );
  for (const field of [
    "conflicts",
    "dependencies",
    "keywords",
    "optionalDependencies",
    "permissions",
  ] as const) {
    const actualValue = field === "permissions" ? [...actual[field]].sort() : actual[field];
    const expectedValue = field === "permissions" ? [...expected[field]].sort() : expected[field];
    if (normalize(actualValue) !== normalize(expectedValue)) {
      throw new Error(
        `Extension "${expected.id}" module ${field} do not match descriptor`,
      );
    }
  }
}

function proxyView(
  session: ExternalPluginSandboxSession,
  manifest: PluginManifest,
  view: SerializedSandboxView,
) {
  assertSandboxIcon(view.icon, `View "${view.viewId}" icon`);
  if (view.renderer !== sandboxHandlerKey("renderer", view.viewId)) {
    throw new Error(`View "${view.viewId}" has a non-canonical renderer`);
  }
  const statusBar = view.statusBar;
  if (
    statusBar !== undefined &&
    (typeof statusBar !== "string" ||
      view.target.kind !== "resource" ||
      statusBar !== sandboxHandlerKey("status-bar", view.viewId))
  ) {
    throw new Error(`View "${view.viewId}" has a non-canonical status bar`);
  }
  cloneSandboxJsonValue(view.target, `View "${view.viewId}" target`);
  if (view.target.kind === "standalone") {
    const target: StandaloneViewTarget = {
      kind: "standalone",
      launcher: view.target.launcher
        ? { ...view.target.launcher }
        : undefined,
    };
    return defineView({
      icon: view.icon,
      name: view.name,
      renderer: (props: StandaloneViewProps) =>
        createElement(SandboxedExtensionRenderer, {
          params: { params: props.params },
          permissions: manifest.permissions,
          renderer: view.renderer,
          rendererSandbox: view.rendererSandbox,
          session,
        }),
      target,
      viewId: view.viewId,
    });
  }
  const target: ResourceViewTarget = {
    kind: "resource",
    resourceTypeIds: view.target.resourceTypeIds
      ? [...view.target.resourceTypeIds]
      : undefined,
    schemas: view.target.schemas?.map((schema) => ({ ...schema })),
  };
  return defineView({
    icon: view.icon,
    name: view.name,
    renderer: (props: ResourceViewProps) =>
      createElement(SandboxedExtensionRenderer, {
        params: {
          params: props.params,
          resource: props.resource,
          storage: props.storage,
        },
        permissions: manifest.permissions,
        renderer: view.renderer,
        rendererSandbox: view.rendererSandbox,
        session,
        surfaceCapabilities: {
          "renderer.reportReady": () => props.reportReady?.(),
        },
      }),
    statusBar: statusBar
      ? (props: ResourceViewStatusProps) =>
          createElement(SandboxedExtensionRenderer, {
            params: {
              params: props.params,
              resource: props.resource,
              storage: props.storage,
            },
            permissions: manifest.permissions,
            renderer: statusBar,
            rendererSandbox: view.rendererSandbox,
            session,
          })
      : undefined,
    storageRequirements: view.storageRequirements ?? {},
    target,
    viewId: view.viewId,
  });
}

function sandboxPayloadContext(context: ResourcePayloadContext) {
  return {
    resourceId: context.resourceId,
    storage: Object.fromEntries(Object.entries(context.storage).map(([name, entry]) => {
      if (entry.kind !== "yjs") return [name, structuredClone(entry)];
      const update = encodeStateAsUpdateV2(entry.document);
      return [name, {
        documentUpdate: update.buffer.slice(
          update.byteOffset,
          update.byteOffset + update.byteLength,
        ),
        kind: "yjs",
      }];
    })),
  };
}

function proxyResourceType(
  session: ExternalPluginSandboxSession,
  manifest: PluginManifest,
  resourceType: SerializedSandboxResourceType,
) {
  const { resourceTypeId } = resourceType;
  assertSandboxIcon(resourceType.icon, `Resource type "${resourceTypeId}" icon`);
  for (const [name, slot] of Object.entries(resourceType.storage)) {
    if (slot.initializeHandler && slot.initializeHandler !==
      sandboxHandlerKey("initialize", resourceTypeId, name)) {
      throw new Error(`Resource type "${resourceTypeId}" has a non-canonical initializer`);
    }
  }
  if (
    resourceType.createHandler &&
    resourceType.createHandler !== sandboxHandlerKey("create", resourceTypeId)
  ) {
    throw new Error(`Resource type "${resourceTypeId}" has a non-canonical create handler`);
  }
  if (
    resourceType.schema.readHandler !== sandboxHandlerKey("payload-read", resourceTypeId)
  ) {
    throw new Error(`Resource type "${resourceTypeId}" has a non-canonical payload reader`);
  }
  if (
    resourceType.schema.writeHandler &&
    resourceType.schema.writeHandler !== sandboxHandlerKey("payload-write", resourceTypeId)
  ) {
    throw new Error(`Resource type "${resourceTypeId}" has a non-canonical payload writer`);
  }
  const versions = Object.fromEntries(
    Object.entries(resourceType.schema.validationHandlers).map(([version, handler]) => {
      if (handler !== sandboxHandlerKey("validate", resourceTypeId, version)) {
        throw new Error(`Resource type "${resourceTypeId}" has a non-canonical validator`);
      }
      return [
        Number(version),
        {
          "~standard": {
            validate: (value: unknown) => session.invoke(handler, value),
            vendor: manifest.id,
            version: 1,
          },
        },
      ];
    }),
  );
  const migrations = resourceType.schema.migrationHandlers.map(
    ({ from, handler, to }) => {
      if (handler !== sandboxHandlerKey("migration", resourceTypeId, String(from))) {
        throw new Error(`Resource type "${resourceTypeId}" has a non-canonical migration`);
      }
      return { from, migrate: (payload: unknown) => session.invoke(handler, payload), to };
    },
  );
  return defineResourceType({
    createInWorkspace: resourceType.createHandler
      ? async (context) => {
          requirePermission(manifest, "content.write");
          const result = await session.invoke(
            resourceType.createHandler!,
            { parentId: context.parentId },
            createCapabilities(context, manifest),
          );
          assertResourceCreateResult(result);
          return result;
        }
      : undefined,
    defaultViewId: resourceType.defaultViewId,
    hierarchy: resourceType.hierarchy,
    icon: resourceType.icon,
    name: resourceType.name,
    resourceTypeId,
    schema: {
      currentVersion: resourceType.schema.currentVersion,
      id: resourceType.schema.id,
      migrations,
      read: (context) =>
        session.invoke(
          resourceType.schema.readHandler,
          sandboxPayloadContext(context),
        ),
      versions: versions as never,
      write: resourceType.schema.writeHandler
          ? async (payload, context) => {
            const next = await session.invoke(resourceType.schema.writeHandler!, {
              context: sandboxPayloadContext(context),
              payload,
            });
            if (!next || typeof next !== "object" || Array.isArray(next)) {
              throw new Error("Extension payload writer returned invalid storage");
            }
            for (const [name, entry] of Object.entries(next as Record<string, any>)) {
              const target = context.storage[name];
              if (target?.kind === "yjs") {
                if (!(entry?.documentUpdate instanceof ArrayBuffer)) {
                  throw new Error(`Invalid Yjs payload for ${name}`);
                }
                applyUpdateV2(target.document, new Uint8Array(entry.documentUpdate));
              } else if (target?.kind === "key-value" && entry?.kind === "key-value") {
                for (const key of Object.keys(target.values)) delete target.values[key];
                Object.assign(target.values, entry.values);
              }
            }
          }
        : undefined,
    },
    storage: Object.fromEntries(
      Object.entries(resourceType.storage).map(([name, slot]) => {
        if (slot.kind === "file" || !slot.initializeHandler) {
          return [name, { kind: slot.kind }];
        }
        if (slot.kind === "key-value") {
          return [name, {
            kind: "key-value",
            initialize: async (context: unknown) => {
              requirePermission(manifest, "content.write");
              return session.invoke(slot.initializeHandler!, context) as never;
            },
          }];
        }
        return [name, {
          kind: "yjs",
          initialize: async (doc: import("yjs").Doc, context: unknown) => {
            requirePermission(manifest, "content.write");
            const update = await session.invoke(slot.initializeHandler!, context);
            if (!(update instanceof ArrayBuffer)) {
              throw new Error("Extension initializer returned an invalid Yjs update");
            }
            applyUpdateV2(doc, new Uint8Array(update));
          },
        }];
      }),
    ) as ResourceTypeDefinition["storage"],
  });
}

function proxyCommand(
  session: ExternalPluginSandboxSession,
  manifest: PluginManifest,
  contribution: SerializedSandboxResourceCommand,
) {
  return {
    commands: proxyCommands(session, manifest, contribution.id, contribution.commands),
    id: contribution.id,
    resourceTypeIds: contribution.resourceTypeIds,
    schemas: contribution.schemas,
  };
}

async function serializeFetchResponse(response: Response) {
  return {
    body: await response.arrayBuffer(),
    headers: Array.from(response.headers.entries()),
    status: response.status,
    statusText: response.statusText,
  };
}

function proxySearchIndexer(
  session: ExternalPluginSandboxSession,
  manifest: PluginManifest,
  contribution: SerializedSandboxSearchIndexer,
) {
  if (
    contribution.handler !== sandboxHandlerKey("search-indexer", contribution.id)
  ) {
    throw new Error(`Search indexer "${contribution.id}" has a non-canonical handler`);
  }
  return {
    id: contribution.id,
    resourceTypeIds: contribution.resourceTypeIds,
    schemas: contribution.schemas,
    extractText: async (
      input: SearchIndexerInput,
      context: SearchIndexerContext,
    ) => {
      requirePermission(manifest, "content.read");
      return session.invoke(
        contribution.handler,
        input,
        {
          "searchIndexer.readFile": (storage) => context.readFile(storage),
        },
      ) as Promise<string | null>;
    },
  };
}

function proxySearchQuery(
  session: ExternalPluginSandboxSession,
  manifest: PluginManifest,
  contribution: SerializedSandboxSearchQuery,
) {
  if (
    contribution.queryHandler !== sandboxHandlerKey("search-query", contribution.id) ||
    contribution.openHandler !==
      sandboxHandlerKey("search-query-open", contribution.id)
  ) {
    throw new Error(
      `Search query provider "${contribution.id}" has a non-canonical handler`,
    );
  }
  return {
    id: contribution.id,
    query: (input: Parameters<SearchQueryContribution["query"]>[0], context: SearchQueryContext) =>
      session.invoke(
        contribution.queryHandler,
        input,
        {
          "searchQuery.fetch": async (
            request: RequestInfo | URL,
            init?: RequestInit,
          ) => {
            requirePermission(manifest, "network.https");
            return serializeFetchResponse(await context.fetch(request, init));
          },
        },
      ) as ReturnType<SearchQueryContribution["query"]>,
    open: (result: SearchQueryResult, context: SearchQueryOpenContext) =>
      session.invoke(
        contribution.openHandler,
        result,
        { "searchQuery.openView": context.openView },
      ) as Promise<void>,
  };
}

function proxyDefinition(
  expected: PluginManifest,
  serialized: SerializedSandboxPluginDefinition,
  session: ExternalPluginSandboxSession,
): PluginDefinition {
  assertManifestIdentity(expected, serialized.manifest);
  const locales = cloneSandboxJsonValue(
    serialized.locales ?? {},
    "Extension locales",
  ) as Record<string, Record<string, unknown>>;
  return definePlugin({
    manifest: serialized.manifest,
    activate({ contributions: registry, effects, services, slots }) {
      for (const contribution of serialized.contributions) {
        switch (contribution.type) {
          case "resource-type":
            registry.resourceType(
              proxyResourceType(session, expected, contribution),
            );
            break;
          case "view":
            registry.view(proxyView(session, expected, contribution));
            break;
          case "resource-command":
            registry.command(proxyCommand(session, expected, contribution));
            break;
          case "service-provider": {
            const service = definePluginService({
              id: contribution.id,
              methods: contribution.methods,
              version: contribution.version,
            });
            const implementation = Object.fromEntries(
              contribution.methods.map((method) => {
                const handler = contribution.handlers[method];
                if (
                  handler !==
                  sandboxHandlerKey("service", contribution.id, method)
                ) {
                  throw new Error(
                    `Service "${contribution.id}" has a non-canonical handler`,
                  );
                }
                return [method, (input: unknown) => session.invoke(handler, input)];
              }),
            );
            services.provide(service, implementation as never);
            break;
          }
          case "service-slot": {
            if (contribution.contributorId !== expected.id) {
              throw new Error("Service slot contributor does not match extension");
            }
            if (
              contribution.handler !==
              sandboxHandlerKey(
                "slot",
                contribution.serviceId,
                contribution.id,
              )
            ) {
              throw new Error(
                `Service slot "${contribution.id}" has a non-canonical handler`,
              );
            }
            const service = definePluginService({
              id: contribution.serviceId,
              methods: [],
              version: contribution.serviceVersion,
            });
            slots.contribute(service.slot(contribution.slotId), {
              id: contribution.id,
              invoke: (input) => session.invoke(contribution.handler, input) as never,
              metadata: contribution.metadata,
            });
            break;
          }
          case "search-indexer":
            registry.searchIndexer(
              proxySearchIndexer(session, expected, contribution),
            );
            break;
          case "search-query":
            registry.searchQuery(
              proxySearchQuery(session, expected, contribution),
            );
            break;
          case "workspace-storage":
            registry.workspaceStorage({
              kind: contribution.kind,
              storageId: contribution.storageId,
            });
            break;
        }
      }
      registry.locales(locales);
      effects.add(() => session.activate());
      return () => session.deactivate();
    },
  });
}

export async function loadExternalPlugin(
  reference: ExternalPluginReference,
  plugins: PlatformPlugins,
  { allowNetwork = true }: { allowNetwork?: boolean } = {},
): Promise<LoadedExternalPlugin> {
  const descriptor = await loadExternalPluginDescriptor(reference, plugins, {
    allowNetwork,
  });
  if (descriptor.status !== "active") {
    throw new Error(`Extension "${reference.id}" version is blocked`);
  }
  if (!isPluginApiRangeSupported(descriptor.manifest.api)) {
    throw new Error(
      `Extension "${reference.id}" requires API ${descriptor.manifest.api}`,
    );
  }
  if (
    descriptor.runtime.kind !== "iframe" ||
    !isSupportedSandboxProtocol(descriptor.runtime.protocol)
  ) {
    throw new Error(`Extension "${reference.id}" uses an unsupported runtime`);
  }

  const assets = await verifiedReleaseAssets(descriptor, plugins, {
    allowNetwork,
  });
  const session = new ExternalPluginSandboxSession(
    reference.id,
    assets.script,
    assets.style ? new TextDecoder().decode(assets.style) : undefined,
  );
  try {
    const serialized = await session.start();
    const plugin = proxyDefinition(descriptor.manifest, serialized, session);
    return { dispose: () => session.dispose(), plugin };
  } catch (error) {
    try {
      await session.deactivate();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Extension "${reference.id}" load and cleanup failed`,
      );
    }
    throw error;
  }
}

export async function cachePluginRelease(
  reference: ExternalPluginReference,
  plugins: PlatformPlugins,
): Promise<PluginReleaseDescriptor> {
  const descriptor = await loadExternalPluginDescriptor(reference, plugins);
  if (descriptor.status === "active") {
    await verifiedReleaseAssets(descriptor, plugins);
  }
  return descriptor;
}
