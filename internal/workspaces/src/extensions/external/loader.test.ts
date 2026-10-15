import type { PlatformPlugins } from "@repo/platform";
import {
  getResourceTypeContributions,
  getViewContributions,
  preparePluginActivation,
} from "@lunarisapp/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
  encodeStateVector,
} from "yjs";
import { sha256, verifiedAsset } from "./artifacts";
import {
  assertCommandStorageScope,
  cachePluginRelease,
  loadExternalPlugin,
  loadExternalPluginDescriptor,
  loadExternalPluginIcon,
} from "./loader";

const sandboxSession = vi.hoisted(() => ({
  activate: vi.fn(),
  deactivate: vi.fn(),
  dispose: vi.fn(),
  invoke: vi.fn(),
  start: vi.fn(),
}));

vi.mock("./sandbox", () => ({
  ExternalPluginSandboxSession: class {
    activate = sandboxSession.activate;
    deactivate = sandboxSession.deactivate;
    dispose = sandboxSession.dispose;
    invoke = sandboxSession.invoke;
    start = sandboxSession.start;
  },
  SandboxedExtensionRenderer: () => null,
}));

const pluginScriptUrl = `https://plugins.lunaris.app/artifacts/example.calendar/1.0.0/${"a".repeat(64)}/main.js`;

function store(initial?: Uint8Array) {
  let value = initial;
  return {
    delete: vi.fn(async () => {
      value = undefined;
    }),
    get: vi.fn(async () => value ?? null),
    put: vi.fn(async (_key: string, next: Uint8Array) => {
      value = next;
    }),
  };
}

describe("external extension artifact verification", () => {
  it("resolves relative assets from the pinned descriptor URL", async () => {
    const descriptorUrl =
      "https://raw.githubusercontent.com/example/extensions/abc123/artifacts/example.calendar/1.0.0/release.json";
    const descriptor = new TextEncoder().encode(
      JSON.stringify({
        api: "^0.9.0",
        manifest: {
          api: "^0.9.0",
          description: "Calendar",
          developer: "Example",
          id: "example.calendar",
          name: "Calendar",
          permissions: [],
          version: "1.0.0",
        },
        repository: "https://github.com/example/extensions",
        runtime: { kind: "iframe", protocol: 6 },
        script: {
          bytes: 1,
          resource: "text/javascript",
          sha256: "a".repeat(64),
          url: "./main.js",
        },
        status: "active",
      }),
    );
    const plugins = {
      artifacts: store(),
      fetch: vi.fn(async () => new Response(descriptor)),
    } as unknown as PlatformPlugins;

    const parsed = await loadExternalPluginDescriptor(
      {
        descriptor: {
          bytes: descriptor.byteLength,
          sha256: await sha256(descriptor),
          url: descriptorUrl,
        },
        id: "example.calendar",
        version: "1.0.0",
      },
      plugins,
    );

    expect(parsed.script.url).toBe(
      "https://raw.githubusercontent.com/example/extensions/abc123/artifacts/example.calendar/1.0.0/main.js",
    );
  });

  it("uses a verified offline cache without fetching", async () => {
    const expected = new TextEncoder().encode("cached plugin");
    const plugins = {
      artifacts: store(expected),
      fetch: vi.fn(),
    } as unknown as PlatformPlugins;

    await expect(
      verifiedAsset(
        {
          bytes: expected.byteLength,
          resource: "text/javascript",
          sha256: await sha256(expected),
          url: pluginScriptUrl,
        },
        1024,
        plugins,
        { allowNetwork: false },
      ),
    ).resolves.toEqual(expected);
    expect(plugins.fetch).not.toHaveBeenCalled();
  });

  it("fails an offline cache miss without fetching", async () => {
    const plugins = {
      artifacts: store(),
      fetch: vi.fn(),
    } as unknown as PlatformPlugins;

    await expect(
      verifiedAsset(
        {
          bytes: 8,
          resource: "text/javascript",
          sha256: "a".repeat(64),
          url: pluginScriptUrl,
        },
        1024,
        plugins,
        { allowNetwork: false },
      ),
    ).rejects.toThrow("not cached");
    expect(plugins.fetch).not.toHaveBeenCalled();
  });

  it("deletes corrupt cache and refetches verified bytes", async () => {
    const expected = new TextEncoder().encode("verified plugin");
    const artifacts = store(new TextEncoder().encode("corrupt"));
    const plugins = {
      artifacts,
      fetch: vi.fn(async () => new Response(expected)),
    } as unknown as PlatformPlugins;
    const value = await verifiedAsset(
      {
        bytes: expected.byteLength,
        resource: "text/javascript",
        sha256: await sha256(expected),
        url: pluginScriptUrl,
      },
      1024,
      plugins,
    );
    expect(value).toEqual(expected);
    expect(artifacts.delete).toHaveBeenCalledOnce();
    expect(artifacts.put).toHaveBeenCalledOnce();
  });

  it("rejects a tampered download", async () => {
    const expected = new TextEncoder().encode("expected");
    const plugins = {
      artifacts: store(),
      fetch: vi.fn(async () => new Response("tampered")),
    } as unknown as PlatformPlugins;
    await expect(
      verifiedAsset(
        {
          bytes: 8,
          resource: "text/javascript",
          sha256: await sha256(expected),
          url: pluginScriptUrl,
        },
        1024,
        plugins,
      ),
    ).rejects.toThrow("checksum");
  });

  it("stops reading downloads larger than the catalog declares", async () => {
    const artifacts = store();
    const plugins = {
      artifacts,
      fetch: vi.fn(async () => new Response("oversized")),
    } as unknown as PlatformPlugins;

    await expect(
      verifiedAsset(
        {
          bytes: 8,
          resource: "text/javascript",
          sha256: "a".repeat(64),
          url: pluginScriptUrl,
        },
        1024,
        plugins,
      ),
    ).rejects.toThrow("size does not match catalog");
    expect(artifacts.put).not.toHaveBeenCalled();
  });

  it("reports corrupt offline cache separately from a missing cache", async () => {
    const plugins = {
      artifacts: store(new TextEncoder().encode("corrupt")),
      fetch: vi.fn(async () => {
        throw new TypeError("offline");
      }),
    } as unknown as PlatformPlugins;
    await expect(
      verifiedAsset(
        {
          bytes: 8,
          resource: "text/javascript",
          sha256: "a".repeat(64),
          url: pluginScriptUrl,
        },
        1024,
        plugins,
      ),
    ).rejects.toThrow("cache is corrupt");
  });
});

describe("external extension command capabilities", () => {
  it("limits storage operations to handles on the command resource", () => {
    const storage = {
      content: { kind: "yjs", storageId: "storage_yjs" },
      cover: { kind: "file", storageId: "storage_file" },
    } as const;

    expect(() =>
      assertCommandStorageScope(storage, storage.cover, "file"),
    ).not.toThrow();
    expect(() =>
      assertCommandStorageScope(
        storage,
        { kind: "file", storageId: "storage_other" },
        "file",
      ),
    ).toThrow("Command file storage scope mismatch");
    expect(() =>
      assertCommandStorageScope(storage, storage.content, "file"),
    ).toThrow("Command file storage scope mismatch");
  });
});

describe("external extension loading", () => {
  async function createLoadingFixture(overrides: Record<string, unknown> = {}) {
    const script = new TextEncoder().encode("void 0");
    const descriptorUrl =
      "https://plugins.lunaris.app/releases/example.calendar/1.0.0.json";
    const manifest = {
      api: "^0.9.0",
      conflicts: {},
      dependencies: {},
      optionalDependencies: {},
      description: "Calendar",
      developer: "Example",
      id: "example.calendar",
      name: "Calendar",
      permissions: [],
      version: "1.0.0",
    };
    const descriptor = {
      api: manifest.api,
      manifest,
      repository: "https://github.com/example/calendar",
      runtime: { kind: "iframe", protocol: 6 },
      script: {
        bytes: script.byteLength,
        resource: "text/javascript",
        sha256: await sha256(script),
        url: pluginScriptUrl,
      },
      status: "active",
      ...overrides,
    };
    const encodedDescriptor = new TextEncoder().encode(JSON.stringify(descriptor));
    const plugins = {
      artifacts: store(),
      fetch: vi.fn(async (url: string | URL | Request) =>
        new Response(String(url) === descriptorUrl ? encodedDescriptor : script),
      ),
    } as unknown as PlatformPlugins;
    return {
      descriptor,
      plugins,
      reference: {
        descriptor: {
          bytes: encodedDescriptor.byteLength,
          sha256: await sha256(encodedDescriptor),
          url: descriptorUrl,
        },
        id: manifest.id,
        version: manifest.version,
      },
    };
  }

  it("rejects blocked, incompatible, and unsupported releases before startup", async () => {
    const blocked = await createLoadingFixture({ status: "blocked" });
    await expect(loadExternalPlugin(blocked.reference, blocked.plugins)).rejects.toThrow(
      "version is blocked",
    );

    const incompatible = await createLoadingFixture({
      api: "^99.0.0",
      manifest: {
        ...(blocked.descriptor.manifest as object),
        api: "^99.0.0",
      },
    });
    await expect(
      loadExternalPlugin(incompatible.reference, incompatible.plugins),
    ).rejects.toThrow("requires API");

    const unsupported = await createLoadingFixture({
      runtime: { kind: "iframe", protocol: 99 },
    });
    await expect(
      loadExternalPlugin(unsupported.reference, unsupported.plugins),
    ).rejects.toThrow("expected 6 or 7");
    expect(sandboxSession.start).not.toHaveBeenCalled();
  });

  it("aggregates sandbox startup and cleanup failures", async () => {
    sandboxSession.start.mockReset().mockRejectedValue(new Error("startup failed"));
    sandboxSession.deactivate.mockReset().mockRejectedValue(new Error("cleanup failed"));
    const fixture = await createLoadingFixture();

    const error = await loadExternalPlugin(fixture.reference, fixture.plugins).catch(
      (caught) => caught,
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([
      expect.objectContaining({ message: "startup failed" }),
      expect.objectContaining({ message: "cleanup failed" }),
    ]);
  });

  it("skips missing icons and does not cache assets for blocked releases", async () => {
    const fixture = await createLoadingFixture({ status: "blocked" });
    await expect(
      loadExternalPluginIcon(fixture.descriptor as never, fixture.plugins),
    ).resolves.toBeNull();
    await expect(cachePluginRelease(fixture.reference, fixture.plugins)).resolves.toMatchObject({
      status: "blocked",
    });
    expect(fixture.plugins.fetch).toHaveBeenCalledOnce();
  });

  it("transports Yjs payload contexts and renderer readiness without live values", async () => {
    sandboxSession.deactivate.mockReset().mockResolvedValue(undefined);
    sandboxSession.invoke.mockReset();
    sandboxSession.start.mockReset();
    const script = new TextEncoder().encode("void 0");
    const descriptorUrl =
      "https://plugins.lunaris.app/releases/example.calendar/1.0.0.json";
    const manifest = {
      api: "^0.9.0",
      conflicts: {},
      dependencies: {},
      optionalDependencies: {},
      description: "Calendar",
      developer: "Example",
      id: "example.calendar",
      name: "Calendar",
      permissions: ["content.read", "content.write"],
      version: "1.0.0",
    } as const;
    const descriptor = {
      api: manifest.api,
      manifest,
      repository: "https://github.com/example/calendar",
      runtime: { kind: "iframe", protocol: 6 },
      script: {
        bytes: script.byteLength,
        resource: "text/javascript",
        sha256: await sha256(script),
        url: pluginScriptUrl,
      },
      status: "active",
    };
    const encodedDescriptor = new TextEncoder().encode(JSON.stringify(descriptor));
    const plugins = {
      artifacts: store(),
      fetch: vi.fn(async (url: string | URL | Request) =>
        new Response(
          String(url) === descriptorUrl ? encodedDescriptor : script,
        ),
      ),
    } as unknown as PlatformPlugins;
    sandboxSession.start.mockResolvedValue({
      contributions: [
        {
          defaultViewId: "example.calendar.view",
          hierarchy: {},
          icon: [["path", { d: "M4 4h16v16H4z" }]],
          name: "Calendar",
          resourceTypeId: "example.calendar",
          schema: {
            currentVersion: 1,
            id: "example.calendar.schema",
            migrationHandlers: [],
            readHandler: "payload-read:example.calendar:default",
            validationHandlers: {
              1: "validate:example.calendar:1",
            },
            writeHandler: "payload-write:example.calendar:default",
          },
          storage: { content: { kind: "yjs" } },
          type: "resource-type",
        },
        {
          icon: [["path", { d: "M4 4h16v16H4z" }]],
          name: "Calendar",
          renderer: "renderer:example.calendar.view:default",
          rendererSandbox: "local-srcdoc",
          storageRequirements: { content: "yjs" },
          statusBar: "status-bar:example.calendar.view:default",
          target: {
            kind: "resource",
            resourceTypeIds: ["example.calendar"],
          },
          type: "view",
          viewId: "example.calendar.view",
        },
      ],
      locales: {},
      manifest,
    });
    sandboxSession.invoke.mockImplementation(
      async (handler: string, input: unknown) => {
        if (handler === "payload-read:example.calendar:default") {
          return { title: "stored" };
        }
        if (handler === "payload-write:example.calendar:default") {
          const documentUpdate = (
            input as {
              context: { storage: { content: { documentUpdate: ArrayBuffer } } };
            }
          ).context.storage.content.documentUpdate;
          const sandboxDoc = new Doc();
          try {
            applyUpdateV2(sandboxDoc, new Uint8Array(documentUpdate));
            const stateVector = encodeStateVector(sandboxDoc);
            sandboxDoc.getMap("metadata").set("title", "migrated");
            return {
              content: {
                documentUpdate: encodeStateAsUpdateV2(sandboxDoc, stateVector).buffer,
                kind: "yjs",
              },
            };
          } finally {
            sandboxDoc.destroy();
          }
        }
        return { value: {} };
      },
    );

    const loaded = await loadExternalPlugin(
      {
        descriptor: {
          bytes: encodedDescriptor.byteLength,
          sha256: await sha256(encodedDescriptor),
          url: descriptorUrl,
        },
        id: manifest.id,
        version: manifest.version,
      },
      plugins,
    );
    const activation = await preparePluginActivation(loaded.plugin);
    const resourceType = getResourceTypeContributions(activation)[0];
    const view = getViewContributions(activation)[0];
    if (!resourceType || !view) throw new Error("Fixture contribution missing");
    const document = new Doc();
    document.getMap("metadata").set("title", "stored");
    const context = {
      resourceId: "resource-1",
      storage: { content: { document, kind: "yjs" as const } },
    };

    await expect(resourceType.schema.read(context)).resolves.toEqual({
      title: "stored",
    });
    const readInput = sandboxSession.invoke.mock.calls[0]?.[1];
    expect(readInput).toMatchObject({
      resourceId: "resource-1",
      storage: {
        content: { documentUpdate: expect.any(ArrayBuffer), kind: "yjs" },
      },
    });
    expect(readInput).not.toHaveProperty("document");
    await resourceType.schema.write?.({ title: "migrated" }, context);
    expect(document.getMap("metadata").get("title")).toBe("migrated");
    const writeInput = sandboxSession.invoke.mock.calls[1]?.[1];
    expect(writeInput).not.toHaveProperty("context.document");
    expect(writeInput).toHaveProperty(
      "context.storage.content.documentUpdate",
      expect.any(ArrayBuffer),
    );

    const reportReady = vi.fn();
    const rendered = view.renderer({
      params: {},
      reportReady,
      resource: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "example.calendar",
        schemaId: "example.calendar.schema",
        schemaVersion: 1,
      },
      storage: { content: { kind: "yjs", storageId: "storage-1" } },
    } as never) as unknown as {
      props: {
        params: Record<string, unknown>;
        surfaceCapabilities?: Record<string, () => void>;
      };
    };
    expect(rendered.props.params).not.toHaveProperty("reportReady");
    rendered.props.surfaceCapabilities?.["renderer.reportReady"]?.();
    expect(reportReady).toHaveBeenCalledOnce();

    const status = view.target.kind === "resource"
      ? view.statusBar?.({
          params: { mode: "month" },
          resource: {
            parentId: null,
            resourceId: "resource-1",
            resourceTypeId: "example.calendar",
            schemaId: "example.calendar.schema",
            schemaVersion: 1,
          },
          storage: { content: { kind: "yjs", storageId: "storage-1" } },
        })
      : undefined;
    expect(status).toMatchObject({
      props: {
        params: expect.objectContaining({ params: { mode: "month" } }),
        renderer: "status-bar:example.calendar.view:default",
        rendererSandbox: "local-srcdoc",
      },
    });

    document.destroy();
    await activation.dispose();
    loaded.dispose();
  });

  it("awaits sandbox cleanup when registration validation fails", async () => {
    sandboxSession.start.mockReset();
    sandboxSession.deactivate.mockReset();
    const script = new TextEncoder().encode("void 0");
    const descriptorUrl =
      "https://plugins.lunaris.app/releases/example.calendar/1.0.0.json";
    const manifest = {
      api: "^0.9.0",
      description: "Calendar",
      developer: "Example",
      id: "example.calendar",
      name: "Calendar",
      permissions: [],
      version: "1.0.0",
    };
    const descriptor = {
      api: manifest.api,
      manifest,
      repository: "https://github.com/example/calendar",
      runtime: { kind: "iframe", protocol: 6 },
      script: {
        bytes: script.byteLength,
        resource: "text/javascript",
        sha256: await sha256(script),
        url: pluginScriptUrl,
      },
      status: "active",
    };
    const encodedDescriptor = new TextEncoder().encode(JSON.stringify(descriptor));
    const artifacts = store();
    const plugins = {
      artifacts,
      fetch: vi.fn(async (url: string | URL | Request) =>
        new Response(
          String(url) === descriptorUrl ? encodedDescriptor : script,
        ),
      ),
    } as unknown as PlatformPlugins;
    sandboxSession.start.mockResolvedValue({
      locales: {},
      manifest: { ...manifest, id: "example.other" },
      renderers: [],
    });
    let finishCleanup: (() => void) | undefined;
    sandboxSession.deactivate.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishCleanup = resolve;
      }),
    );

    const loading = loadExternalPlugin(
      {
        descriptor: {
          bytes: encodedDescriptor.byteLength,
          sha256: await sha256(encodedDescriptor),
          url: descriptorUrl,
        },
        id: manifest.id,
        version: manifest.version,
      },
      plugins,
    );
    const rejected = vi.fn();
    void loading.catch(rejected);
    await vi.waitFor(() => expect(sandboxSession.deactivate).toHaveBeenCalledOnce());

    expect(rejected).not.toHaveBeenCalled();
    finishCleanup?.();
    await expect(loading).rejects.toThrow("module id does not match descriptor");
  });
});
