import {
  definePlugin,
  type PluginDefinition,
  type SearchIndexerContribution,
  type SearchQueryContribution,
} from "@lunarisapp/plugin-sdk";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginLifecycle, type PluginLifecycle } from "./lifecycle";
import { PluginRegistry } from "./registry";

function plugin(
  id: string,
  options: {
    dependencies?: Record<string, string>;
    effect?: () => (() => void) | void;
    resourceIds?: readonly string[];
  } = {}
): PluginDefinition {
  const resourceIds = options.resourceIds ?? [id];
  return definePlugin({
    manifest: {
      api: "^0.9.0",
      conflicts: {},
      dependencies: options.dependencies ?? {},
      description: `${id} extension`,
      developer: "Acme",
      id,
      name: id,
      permissions: [],
      version: "1.0.0",
    },
    activate({ contributions, effects }) {
      for (const resourceId of resourceIds) {
        const viewId = `${resourceId}.view`;
        contributions.resourceType({
          defaultViewId: viewId,
          icon: [],
          resourceTypeId: resourceId,
          name: resourceId,
          schema: {
            currentVersion: 1,
            id: `${resourceId}.schema`,
            read: () => ({}),
            versions: { 1: z.object({}) },
          },
          storage: {},
        });
        contributions.view({
          icon: [],
          viewId,
          name: `${resourceId} view`,
          renderer: () => null,
          storageRequirements: {},
          target: { kind: "resource", resourceTypeIds: [resourceId] },
        });
      }
      if (options.effect) {
        effects.add(options.effect);
      }
    },
  });
}

const deps = () => ({
  gridLayoutRegister: vi.fn(),
  gridLayoutUnregister: vi.fn(),
});

let lifecycle: PluginLifecycle;
let registry: PluginRegistry;

beforeEach(() => {
  registry = new PluginRegistry();
  lifecycle = createPluginLifecycle({ plugins: registry });
});

describe("Cordis-backed extension lifecycle", () => {
  it("commits registrations atomically and batches listeners", async () => {
    const listener = vi.fn();
    registry.subscribe(listener);

    const result = await lifecycle.initializePlugins(
      [
        plugin("acme.notes", {
          resourceIds: ["acme.notes", "acme.notes.task"],
        }),
      ],
      deps()
    );

    expect(result).toEqual([{ pluginId: "acme.notes", success: true }]);
    expect(registry.getResourceType("acme.notes")).toBeDefined();
    expect(registry.getView("acme.notes.task.view")).toBeDefined();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("rolls back all registrations when a grid registration fails", async () => {
    const unregister = vi.fn();
    const register = vi.fn(() => {
      throw new Error("grid failed");
    });

    const [result] = await lifecycle.initializePlugins([plugin("acme.notes")], {
      gridLayoutRegister: register,
      gridLayoutUnregister: unregister,
    });

    expect(result).toMatchObject({ success: false });
    expect(registry.has("acme.notes")).toBe(false);
    expect(registry.getResourceType("acme.notes")).toBeUndefined();
  });

  it("waits for dependencies before activating", async () => {
    const dependent = plugin("acme.comments", {
      dependencies: { "acme.notes": "^1.0.0" },
    });
    const [pending] = await lifecycle.initializePlugins([dependent], deps());
    expect(pending?.success).toBe(true);
    expect(registry.has("acme.comments")).toBe(false);

    await lifecycle.initializePlugins([plugin("acme.notes")], deps());
    expect(registry.has("acme.comments")).toBe(true);
  });

  it("disposes effects and registrations in reverse activation order", async () => {
    const order: string[] = [];
    const value = plugin("acme.notes", {
      effect: () => {
        order.push("start");
        return () => order.push("effect");
      },
    });
    const lifecycleDeps = deps();
    lifecycleDeps.gridLayoutUnregister.mockImplementation(() => {
      order.push("view");
    });

    await lifecycle.initializePlugins([value], lifecycleDeps);
    await lifecycle.disablePlugin(value.manifest.id);

    expect(order).toEqual(["start", "view", "effect"]);
    expect(registry.has(value.manifest.id)).toBe(false);
  });

  it("reloads without leaking duplicate capabilities", async () => {
    const value = plugin("acme.notes");
    const lifecycleDeps = deps();
    await lifecycle.initializePlugins([value], lifecycleDeps);

    expect((await lifecycle.reloadPlugin(value, lifecycleDeps)).success).toBe(
      true
    );
    expect(
      registry
        .getResourceTypes()
        .filter(({ definition }) => definition.resourceTypeId === "acme.notes")
    ).toHaveLength(1);
  });

  it("registers cross-extension resource views as alternates", async () => {
    const lifecycleDeps = deps();
    await lifecycle.initializePlugins([plugin("acme.notes")], lifecycleDeps);
    const alternate = definePlugin({
      manifest: {
        api: "^0.9.0",
        conflicts: {},
        dependencies: { "acme.notes": "^1.0.0" },
        description: "Alternate notes view",
        developer: "Acme",
        id: "acme.alt",
        name: "Alternate",
        permissions: [],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.view({
          icon: [],
          viewId: "acme.alt.preview",
          name: "Preview",
          renderer: () => null,
          storageRequirements: {},
          target: { kind: "resource", resourceTypeIds: ["acme.notes"] },
        });
      },
    });

    await lifecycle.initializePlugins([alternate], lifecycleDeps);

    expect(lifecycleDeps.gridLayoutRegister).toHaveBeenCalledWith(
      "acme.alt",
      "acme.alt.preview",
      expect.any(Function)
    );
    await lifecycle.disablePlugin("acme.alt");
    expect(lifecycleDeps.gridLayoutUnregister).toHaveBeenCalledWith(
      "acme.alt",
      "acme.alt.preview"
    );
  });

  it("scopes search capabilities and removes them on unload", async () => {
    const extractText: SearchIndexerContribution["extractText"] = vi.fn(
      async (input, context) => {
        const file = await context.readFile(input.storage.content!);
        return file ? new TextDecoder().decode(file.bytes) : null;
      }
    );
    const query: SearchQueryContribution["query"] = vi.fn(
      async (_input, context) => {
        await context.fetch("https://example.com/search");
        return { items: [], nextCursor: null };
      }
    );
    const value = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Search",
        developer: "Acme",
        id: "acme.search",
        name: "Search",
        permissions: ["content.read", "files.read", "network.https"],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.searchIndexer({
          extractText,
          id: "acme.search.indexer",
          resourceTypeIds: ["lunaris.folder"],
        });
        contributions.searchQuery({
          id: "acme.search.query",
          open: () => undefined,
          query,
        });
      },
    });

    await lifecycle.initializePlugins([value], deps());
    const indexer = registry.getSearchIndexers()[0]?.definition;
    const provider = registry.getSearchQueries()[0]?.definition;
    const bytes = new TextEncoder().encode("indexed").buffer;
    await expect(
      indexer?.extractText(
        {
          storage: { content: { kind: "file", storageId: "file-1" } },
        } as never,
        {
          readFile: () => Promise.resolve({ bytes, mediaType: "text/plain" }),
        }
      )
    ).resolves.toBe("indexed");
    const fetch = vi.fn().mockResolvedValue(new Response()) as never;
    await expect(
      provider?.query({ limit: 10, text: "x" }, { fetch })
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(fetch).toHaveBeenCalledOnce();

    await lifecycle.reloadPlugin(value, deps());
    expect(registry.getSearchIndexers()).toHaveLength(1);
    expect(registry.getSearchQueries()).toHaveLength(1);

    await lifecycle.disablePlugin("acme.search");
    expect(registry.getSearchIndexers()).toEqual([]);
    expect(registry.getSearchQueries()).toEqual([]);
  });

  it("returns activation failures without leaving registrations", async () => {
    const broken = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Broken",
        developer: "Acme",
        id: "acme.broken",
        name: "Broken",
        permissions: [],
        version: "1.0.0",
      },
      activate() {
        throw new Error("activation failed");
      },
    });

    const [result] = await lifecycle.initializePlugins([broken], deps());

    expect(result).toMatchObject({
      error: expect.objectContaining({ message: "activation failed" }),
      pluginId: "acme.broken",
      success: false,
    });
    expect(registry.has("acme.broken")).toBe(false);
  });

  it("runs external unregister even when extension cleanup fails", async () => {
    const value = plugin("acme.notes", {
      effect: () => () => {
        throw new Error("cleanup failed");
      },
    });
    const unregister = vi.fn();
    await lifecycle.initializePlugins([value], deps());

    await expect(
      lifecycle.disablePlugin("acme.notes", unregister)
    ).rejects.toThrow("cleanup failed");
    expect(unregister).toHaveBeenCalledWith("acme.notes");
  });

  it("continues cleaning other extensions and aggregates failures", async () => {
    const first = plugin("acme.first", {
      effect: () => () => {
        throw new Error("first cleanup failed");
      },
    });
    const second = plugin("acme.second", {
      effect: () => () => {
        throw new Error("second cleanup failed");
      },
    });
    await lifecycle.initializePlugins([first, second], deps());

    await expect(
      lifecycle.cleanupPlugins([first, second])
    ).rejects.toBeInstanceOf(AggregateError);
    expect(registry.has("acme.first")).toBe(false);
    expect(registry.has("acme.second")).toBe(false);
  });

  it("enforces content.write on extension storage initializers", async () => {
    const value = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Storage",
        developer: "Acme",
        id: "acme.storage",
        name: "Storage",
        permissions: [],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.resourceType({
          defaultViewId: "acme.storage.view",
          icon: [],
          name: "Storage",
          resourceTypeId: "acme.storage",
          schema: {
            currentVersion: 1,
            id: "acme.storage.schema",
            read: () => ({}),
            versions: { 1: z.object({}) },
          },
          storage: {
            metadata: {
              initialize: () => ({ ready: true }),
              kind: "key-value",
            },
          },
        });
        contributions.view({
          icon: [],
          name: "Storage",
          renderer: () => null,
          storageRequirements: { metadata: "key-value" },
          target: { kind: "resource", resourceTypeIds: ["acme.storage"] },
          viewId: "acme.storage.view",
        });
      },
    });
    await lifecycle.initializePlugins([value], deps());
    const initializer =
      registry.getResourceType("acme.storage")?.definition.storage.metadata
        ?.initialize;

    expect(() =>
      initializer?.({
        createdAt: "2026-01-01T00:00:00.000Z",
        parentId: null,
        resourceId: "resource-1",
        userId: null,
      })
    ).toThrow('has not declared permission "content.write"');
  });

  it("enforces command and search permissions at invocation time", async () => {
    const command = vi.fn();
    const value = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Restricted",
        developer: "Acme",
        id: "acme.restricted",
        name: "Restricted",
        permissions: [],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.command({
          commands: [
            {
              icon: [],
              id: "run",
              labelKey: "run",
              onExecute: command,
            },
            {
              children: [
                {
                  icon: [],
                  id: "nested",
                  labelKey: "nested",
                  onExecute: command,
                },
              ],
              id: "group",
              labelKey: "group",
            },
          ],
          id: "acme.restricted.commands",
          resourceTypeIds: ["acme.restricted"],
        });
        contributions.searchIndexer({
          extractText: async (_input, context) => {
            await context.readFile({ kind: "file", storageId: "file-1" });
            return "text";
          },
          id: "acme.restricted.indexer",
          resourceTypeIds: ["acme.restricted"],
        });
        contributions.searchQuery({
          id: "acme.restricted.query",
          open: () => undefined,
          query: async (_input, context) => {
            await context.fetch("https://example.com");
            return { items: [], nextCursor: null };
          },
        });
      },
    });
    await lifecycle.initializePlugins([value], deps());

    const commands = registry.getCommands()[0]?.definition.commands ?? [];
    const direct = commands[0];
    const grouped = commands[1];
    expect(() =>
      direct && "onExecute" in direct
        ? direct.onExecute({} as never)
        : undefined
    ).toThrow('permission "content.read"');
    expect(() =>
      grouped && "children" in grouped
        ? grouped.children?.[0]?.onExecute({} as never)
        : undefined
    ).toThrow('permission "content.read"');
    expect(() =>
      registry
        .getSearchIndexers()[0]
        ?.definition.extractText({ storage: {} } as never, {
          readFile: vi.fn(),
        })
    ).toThrow('permission "content.read"');
    await expect(
      registry
        .getSearchQueries()[0]
        ?.definition.query(
          { limit: 10, text: "x" },
          { fetch: vi.fn() as never }
        )
    ).rejects.toThrow('permission "network.https"');
    expect(command).not.toHaveBeenCalled();
  });

  it("registers workspace storage, standalone views, and locales", async () => {
    const bundles = new Map<string, Record<string, unknown>>([
      ["en", { base: "Base" }],
    ]);
    const i18n = {
      addResourceBundle: vi.fn(
        (
          language: string,
          _namespace: string,
          resources: Record<string, unknown>
        ) => {
          bundles.set(language, {
            ...(bundles.get(language) ?? {}),
            ...resources,
          });
        }
      ),
      getResourceBundle: vi.fn((language: string) => bundles.get(language)),
      removeResourceBundle: vi.fn((language: string) =>
        bundles.delete(language)
      ),
    };
    const value = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Organization",
        developer: "Acme",
        id: "acme.organization",
        name: "Organization",
        permissions: [],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.workspaceStorage({
          kind: "key-value",
          storageId: "acme.organization.settings",
        });
        contributions.view({
          icon: [],
          name: "Organization",
          renderer: () => null,
          target: { kind: "standalone" },
          viewId: "acme.organization.view",
        });
        contributions.locales({ en: { extension: "Organization" } });
      },
    });
    const lifecycleDeps = { ...deps(), i18n };

    await lifecycle.initializePlugins([value], lifecycleDeps);

    expect(
      registry.getWorkspaceStorage("acme.organization.settings")
    ).toBeDefined();
    expect(lifecycleDeps.gridLayoutRegister).toHaveBeenCalledWith(
      "acme.organization",
      "acme.organization.view",
      expect.any(Function)
    );
    expect(i18n.addResourceBundle).toHaveBeenCalled();

    await lifecycle.disablePlugin("acme.organization");
    expect(
      registry.getWorkspaceStorage("acme.organization.settings")
    ).toBeUndefined();
    expect(bundles.get("en")).toEqual({ base: "Base" });
  });

  it("reports reload failures and unregisters stale grid entries first", async () => {
    const broken = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Broken",
        developer: "Acme",
        id: "acme.broken-reload",
        name: "Broken",
        permissions: [],
        version: "1.0.0",
      },
      activate() {
        // biome-ignore lint/style/useThrowOnlyError: Exercises conversion of non-Error plugin exceptions.
        throw "reload failed";
      },
    });
    const unregister = vi.fn();

    const result = await lifecycle.reloadPlugin(broken, deps(), unregister);

    expect(unregister).toHaveBeenCalledWith("acme.broken-reload");
    expect(result).toMatchObject({
      error: expect.objectContaining({ message: "reload failed" }),
      pluginId: "acme.broken-reload",
      success: false,
    });
  });

  it("forwards allowed capabilities through scoped contributions", async () => {
    const command = vi.fn(() => "ran");
    const createResource = vi.fn().mockResolvedValue({
      name: "Created",
      resourceId: "resource-1",
      storage: {},
    });
    const uploadFile = vi.fn().mockResolvedValue({
      kind: "file",
      storageId: "file-1",
    });
    const open = vi.fn();
    const render = vi.fn(() => null);
    const statusBar = vi.fn(() => null);
    const value = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Allowed",
        developer: "Acme",
        id: "acme.allowed",
        name: "Allowed",
        permissions: [
          "content.read",
          "content.write",
          "files.read",
          "files.write",
          "network.https",
        ],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.resourceType({
          createInWorkspace: async (context) => {
            await context.uploadFile({
              file: new File(["x"], "x.txt"),
              storage: { kind: "file", storageId: "file-1" },
            });
            return context.createResource({ name: "Created" });
          },
          defaultViewId: "acme.allowed.view",
          icon: [],
          name: "Allowed",
          resourceTypeId: "acme.allowed",
          schema: {
            currentVersion: 1,
            id: "acme.allowed.schema",
            read: () => ({}),
            versions: { 1: z.object({}) },
          },
          storage: { file: { kind: "file" } },
        });
        contributions.view({
          icon: [],
          name: "Allowed",
          renderer: render,
          statusBar,
          storageRequirements: { file: "file" },
          target: { kind: "resource", resourceTypeIds: ["acme.allowed"] },
          viewId: "acme.allowed.view",
        });
        contributions.command({
          commands: [
            { icon: [], id: "run", labelKey: "run", onExecute: command },
          ],
          id: "acme.allowed.commands",
          resourceTypeIds: ["acme.allowed"],
        });
        contributions.searchIndexer({
          extractText: async (_input, context) => {
            await context.readFile({ kind: "file", storageId: "file-1" });
            return "indexed";
          },
          id: "acme.allowed.indexer",
          resourceTypeIds: ["acme.allowed"],
        });
        contributions.searchQuery({
          id: "acme.allowed.query",
          open,
          query: async (_input, context) => {
            await context.fetch("https://example.com");
            return { items: [], nextCursor: null };
          },
        });
      },
    });
    await lifecycle.initializePlugins([value], deps());

    await expect(
      registry.getResourceType("acme.allowed")?.definition.createInWorkspace?.({
        createResource,
        deleteResource: vi.fn(),
        parentId: null,
        workspaceId: "workspace-1",
        uploadFile,
      } as never)
    ).resolves.toMatchObject({ resourceId: "resource-1" });
    expect(uploadFile).toHaveBeenCalledOnce();

    const registeredView = registry.getView("acme.allowed.view")?.definition;
    registeredView?.renderer({} as never);
    if (registeredView && "statusBar" in registeredView) {
      registeredView.statusBar?.({} as never);
    }
    const registeredCommand = registry.getCommands()[0]?.definition.commands[0];
    expect(
      registeredCommand && "onExecute" in registeredCommand
        ? registeredCommand.onExecute({} as never)
        : undefined
    ).toBe("ran");
    await expect(
      registry
        .getSearchIndexers()[0]
        ?.definition.extractText({ storage: {} } as never, {
          readFile: vi.fn().mockResolvedValue(null),
        })
    ).resolves.toBe("indexed");
    const provider = registry.getSearchQueries()[0]?.definition;
    await expect(
      provider?.query(
        { limit: 1, text: "x" },
        { fetch: vi.fn().mockResolvedValue(new Response()) as never }
      )
    ).resolves.toEqual({ items: [], nextCursor: null });
    provider?.open({ id: "result" } as never, {} as never);
    expect(open).toHaveBeenCalledOnce();
  });

  it("reports locale registration plus rollback failures", async () => {
    const value = definePlugin({
      manifest: {
        api: "^0.9.0",
        description: "Locales",
        developer: "Acme",
        id: "acme.locales",
        name: "Locales",
        permissions: [],
        version: "1.0.0",
      },
      activate({ contributions }) {
        contributions.locales({ en: { title: "Locales" } });
      },
    });
    const i18n = {
      addResourceBundle: vi.fn(),
      getResourceBundle: vi.fn(() => ({})),
      removeResourceBundle: vi.fn(() => {
        throw new Error("locale remove failed");
      }),
    };

    const [result] = await lifecycle.initializePlugins([value], {
      ...deps(),
      i18n,
    });

    expect(result).toMatchObject({ success: false });
    expect(result?.error).toBeInstanceOf(AggregateError);
  });

  it("exposes runtime diagnostics subscriptions", () => {
    const listener = vi.fn();
    const unsubscribe = lifecycle.subscribePluginDiagnostics(listener);

    expect(lifecycle.getPluginDiagnostics()).toEqual([]);
    expect(unsubscribe).toBeTypeOf("function");
  });
});
