import { render, waitFor } from "@testing-library/react";
import { PLUGIN_SANDBOX_PROTOCOL_VERSION } from "@lunarisapp/plugin-sdk";
import {
  ExtensionSdkProvider,
  type PluginSdkRuntime,
} from "@lunarisapp/plugin-sdk/internal";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  assertFileStorageScope,
  ExternalPluginSandboxSession,
  SandboxedExtensionRenderer,
} from "./sandbox";

vi.mock("@repo/data/core", () => ({
  usePowerSync: () => ({}),
}));

vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  createStorageValueService: () => ({ remove: vi.fn(), set: vi.fn() }),
  ensureWorkspaceStorageSlot: vi.fn(),
  useWorkspaceStorageSlots: () => ({ data: [] }),
  useStorageValues: () => ({ data: [], isFetching: false, isLoading: false }),
}));

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.removeProperty("--background");
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
  document.body.replaceChildren();
  document.head.querySelectorAll("script, style").forEach((node) => node.remove());
});

function sandboxRuntime(): PluginSdkRuntime {
  const emptyStore = {
    getVersion: () => 0,
    subscribe: () => () => undefined,
  };
  const noOp = vi.fn();
  const services = {
    ...emptyStore,
    getService: () => undefined,
    getSlotContributions: () => [],
    invokeService: vi.fn(),
    invokeSlot: vi.fn(),
    snapshot: () => ({ providers: [], slots: [], version: 0 }),
  };
  return {
    contributions: {
      ...emptyStore,
      getWorkspaceStorages: () => [],
    },
    resources: {
      ...emptyStore,
      getResourceType: () => undefined,
      getResourceTypes: () => [],
    },
    data: {
      usePluginData: () => ({
        isFetching: false,
        isLoading: false,
        remove: vi.fn(),
        set: vi.fn(),
        value: null,
      }),
      useReadyYjsDocument: () => ({
        error: null,
        isLoading: false,
        yDoc: null,
        yProvider: null,
      }),
      useReadyYjsStorage: (storage: { storageId: string }) => ({
        error: null,
        isLoading: false,
        yDoc: null,
        yProvider: null,
      }),
    },
    host: {
      useApiTransport: () => ({ baseUrl: "https://api.example.com", fetch }),
      useDownloads: () => ({ save: vi.fn() }),
      useResourceReadContext: () => ({
        getWorkspaceResource: vi.fn(),
        getWorkspaceResourceChildren: vi.fn(),
        getYjsStorageUpdates: vi.fn(),
        resolveResource: vi.fn().mockResolvedValue({ status: "ready" }),
      }),
      useCurrentWorkspace: () => ({ workspace: null, workspaceId: "workspace-1" }),
      useCurrentUser: () => ({ isLoading: false, user: { id: "user-1" } }),
      useYjsStorageLastEdited: () => ({
        isLoading: false,
        lastEditedAt: null,
      }),
      useFileStorage: () => ({ download: vi.fn(), upload: vi.fn() }),
      useLocale: () => ({ locale: "en" }),
      useLunarisContent: () => ({
        activeResourceId: null,
        activeStorage: {},
        activeWorkspaceId: "workspace-1",
        executeAgentTool: vi.fn(),
        getAgentToolPolicy: () => null,
        listWorkspaces: vi.fn(),
        readYjsStorageJson: vi.fn(),
        searchResources: vi.fn(),
      }),
      useOrgMembersMap: () => ({ isLoading: false, map: new Map() }),
      usePluginFetch: () => fetch,
      useWorkspaceChildrenMap: () => new Map(),
      useWorkspaceResourceActions: () => ({
        create: vi.fn(),
        delete: vi.fn(),
        rename: vi.fn(),
        reorder: vi.fn(),
        touch: vi.fn(),
      }),
      useWorkspaceResourceBreadcrumb: () => [],
      useWorkspaceResourceName: () => "Untitled",
      useWorkspaceResourcesMap: () =>
        new Map([["item-1", { resourceTypeId: "example.plugin" }]]) as never,
      useWorkspaceTrashMap: () => new Map(),
      useStableInitialLoading: () => ({
        showEmpty: false,
        showSkeleton: false,
      }),
      useStoredFile: () => ({ file: null, metadata: null, objectUrl: null }),
      useOrganizationAccess: () => ({
        canDeleteContent: true,
        canWriteContent: true,
      }),
      useOrganizationNavigation: () => ({
        closeViewInstances: noOp,
        navigateToWorkspaceResource: noOp,
        openEntityReference: vi.fn(),
        openResource: noOp,
        openResourceInNewWindow: vi.fn(),
        openView: vi.fn(),
        openViewInNewWindow: vi.fn(),
        setViewInstanceTitle: noOp,
      }),
      useYjsStorageUpdateRows: () => vi.fn(),
    },
    plugins: { ...emptyStore, getViews: () => [] },
    services,
  };
}

describe("external extension iframe sandbox", () => {
  it("restricts attachment uploads to items owned by the external extension", () => {
    const items = new Map([
      ["owned", { resourceTypeId: "example.plugin" }],
      ["foreign", { resourceTypeId: "other.plugin" }],
    ]);

    expect(() =>
      assertFileStorageScope(items, "owned", "example.plugin"),
    ).not.toThrow();
    expect(() =>
      assertFileStorageScope(items, "foreign", "example.plugin"),
    ).toThrow("File storage resource scope mismatch");
    expect(() =>
      assertFileStorageScope(items, "missing", "example.plugin"),
    ).toThrow("File storage resource scope mismatch");
  });

  it.each([6, 7] as const)("hydrates protocol %i with its compatible storage representation", async protocol => {
    vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }));
    const session = new ExternalPluginSandboxSession("example.plugin", new TextEncoder().encode("void 0"));
    vi.spyOn(session, "protocol", "get").mockReturnValue(protocol);
    const mount = vi.spyOn(session, "mount").mockReturnValue({ dispose: vi.fn(), update: vi.fn() });
    const runtime = sandboxRuntime(); const doc = new Y.Doc(); doc.getMap("cells").set("A1", 42);
    runtime.data.useReadyYjsStorage = () => ({ error: null, isLoading: false, yDoc: doc, yProvider: null });
    runtime.host.useOrganizationAccess = () => ({ canWriteContent: false, canDeleteContent: false });
    render(<ExtensionSdkProvider runtime={runtime}><SandboxedExtensionRenderer params={{ storage: { content: { kind: "yjs", storageId: "document-1" } } }} permissions={["content.read", "content.write"]} renderer="renderer:content:example.plugin" session={session} /></ExtensionSdkProvider>);
    await waitFor(() => expect(mount).toHaveBeenCalledOnce());
    const host = mount.mock.calls[0]![4] as { yjs: Array<{ incremental: boolean; available: boolean; update?: ArrayBuffer }> };
    expect(host.yjs[0]!.incremental).toBe(protocol === 7);
    expect(host.yjs[0]!.available).toBe(true);
    if (protocol === 7) expect(host.yjs[0]!.update).toBeUndefined();
    else expect(host.yjs[0]!.update).toBeInstanceOf(ArrayBuffer);
    const capabilities = mount.mock.calls[0]![5];
    const response = await capabilities["yjs.sync"]!("document-1", Uint8Array.from(Y.encodeStateVector(new Y.Doc())).buffer) as { update: ArrayBuffer; stateVector: ArrayBuffer; cursor: { epoch: string; revision: number } };
    const replica = new Y.Doc(); Y.applyUpdateV2(replica, new Uint8Array(response.update));
    expect(replica.getMap("cells").get("A1")).toBe(42);
    doc.getMap("cells").set("A1", 43);
    const delta = await capabilities["yjs.sync"]!("document-1", Uint8Array.from(Y.encodeStateVector(replica)).buffer, response.cursor) as { update: ArrayBuffer; stateVector?: ArrayBuffer };
    expect(delta.stateVector).toBeUndefined();
    expect(delta.update.byteLength).toBeLessThan(100);
    Y.applyUpdateV2(replica, new Uint8Array(delta.update));
    expect(replica.getMap("cells").get("A1")).toBe(43);
    expect(() => capabilities["yjs.sync"]!("foreign", new ArrayBuffer(0))).toThrow("scope");
    expect(() => capabilities["yjs.applyUpdate"]!("document-1", response.update)).toThrow("Permission denied");
    session.dispose(); doc.destroy(); replica.destroy();
  });

  it("exposes only manifest-authorized renderer data and RPC capabilities", async () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const mount = vi.spyOn(session, "mount").mockReturnValue({
      dispose: vi.fn(),
      update: vi.fn(),
    });

    const runtime = sandboxRuntime();
    const useReadyYjsStorage = vi.spyOn(
      runtime.data,
      "useReadyYjsStorage",
    );
    runtime.host.useYjsStorageLastEdited = vi.fn((storage) => ({
      isLoading: storage.storageId === "document-2",
      lastEditedAt:
        storage.storageId === "document-1"
          ? new Date("2026-08-27T10:00:00.000Z")
          : null,
    }));

    render(
      <ExtensionSdkProvider runtime={runtime}>
        <SandboxedExtensionRenderer
          params={{
            params: {
              resourceId: "stale-resource",
            },
            resource: {
              parentId: null,
              resourceId: "item-1",
              resourceTypeId: "example.plugin",
              schemaId: "example.plugin.schema",
              schemaVersion: 1,
            },
            storage: {
              content: { kind: "yjs", storageId: "document-1" },
              secondary: { kind: "yjs", storageId: "document-2" },
            },
          }}
          permissions={["content.read", "content.write", "downloads.write"]}
          renderer="renderer:content:example.plugin"
          session={session}
        />
      </ExtensionSdkProvider>,
    );

    await waitFor(() => expect(mount).toHaveBeenCalledOnce());
    const host = mount.mock.calls[0]?.[4];
    const capabilities = mount.mock.calls[0]?.[5];

    expect(host).toEqual(
      expect.objectContaining({
        resources: expect.any(Array),
        storage: expect.any(Object),
        lastEdited: [
          {
            storageId: "document-1",
            isLoading: false,
            lastEditedAt: "2026-08-27T10:00:00.000Z",
          },
          {
            storageId: "document-2",
            isLoading: true,
            lastEditedAt: null,
          },
        ],
        yjs: [
          expect.objectContaining({
            storageId: "document-1",
            workspaceId: "workspace-1",
          }),
          expect.objectContaining({
            storageId: "document-2",
            workspaceId: "workspace-1",
          }),
        ],
      }),
    );
    expect(useReadyYjsStorage).toHaveBeenCalledWith(
      { kind: "yjs", storageId: "document-1" },
      "workspace-1",
      expect.objectContaining({ enabled: true, userId: "user-1" }),
    );
    expect(useReadyYjsStorage).toHaveBeenCalledWith(
      { kind: "yjs", storageId: "document-2" },
      "workspace-1",
      expect.objectContaining({ enabled: true, userId: "user-1" }),
    );
    expect(host).not.toHaveProperty("api");
    expect(host).not.toHaveProperty("attachment");
    expect(capabilities).toHaveProperty("data.getYjsStorageUpdates");
    expect(capabilities).toHaveProperty("data.resolveResource");
    expect(capabilities).toHaveProperty("downloads.save");
    expect(capabilities).toHaveProperty("resources.create");
    expect(capabilities).toHaveProperty("yjs.applyUpdate");
    expect(capabilities).not.toHaveProperty("api.fetch");
    expect(capabilities).not.toHaveProperty("plugin.fetch");
    expect(capabilities).not.toHaveProperty("attachment.download");
    expect(capabilities).not.toHaveProperty("attachment.upload");

    session.dispose();
  });

  it("creates an opaque-origin frame with restrictive policy", async () => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.setProperty("--background", "#191817");
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:sandbox-${blobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
    const append = vi
      .spyOn(document.body, "append")
      .mockImplementation(() => undefined);
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
      "body { color: red; }",
    );
    const registration = session.start();
    void registration.catch(() => undefined);

    const iframe = append.mock.calls[0]?.[0] as HTMLIFrameElement | undefined;
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(iframe?.getAttribute("allow")).toBe("");
    expect(iframe?.referrerPolicy).toBe("no-referrer");
    expect(iframe?.hidden).toBe(true);
    expect(document.head.querySelector("script")).toBeNull();
    expect(document.head.querySelector("style")).toBeNull();

    const html = await blobs.at(-1)?.text();
    expect(html).toContain(
      "default-src 'none'; script-src blob: 'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg='; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'",
    );
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("worker-src blob:");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg=");
    expect(html).not.toContain("body { color: red; }");
    const encodedStyle = html?.match(/id="lunaris-plugin-style">([^<]+)/)?.[1];
    expect(encodedStyle).toBeDefined();
    const initialStyle = atob(encodedStyle ?? "");
    expect(initialStyle).toContain("color-scheme: dark;");
    expect(initialStyle).toContain("--background: #191817;");

    session.dispose();
    await expect(registration).rejects.toThrow("disposed");
    expect(document.querySelector("iframe")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    append.mockRestore();
  });

  it("ignores errors from a renderer frame disposed during registration", async () => {
    URL.createObjectURL = vi.fn(() => "blob:sandbox-renderer");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const container = document.createElement("div");
    const onError = vi.fn();

    const mount = session.mount(
      container,
      "renderer:view:example",
      undefined,
      {},
      {},
      {},
      onError,
    );
    mount.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("keeps the renderer document URL alive until the frame is disposed", () => {
    URL.createObjectURL = vi.fn(() => "blob:sandbox-renderer");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const container = document.createElement("div");

    const mount = session.mount(
      container,
      "renderer:view:example",
      undefined,
      {},
      {},
      {},
      vi.fn(),
    );
    container.querySelector("iframe")?.dispatchEvent(new Event("load"));

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    mount.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sandbox-renderer");
    session.dispose();
  });

  it("reconnects a reloaded renderer with its latest host snapshot", async () => {
    const channels: Array<{
      port1: {
        close: ReturnType<typeof vi.fn>;
        onmessage: ((event: MessageEvent) => void) | null;
        postMessage: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
      };
      port2: object;
    }> = [];
    class TestMessageChannel {
      port1 = {
        close: vi.fn(),
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
        start: vi.fn(),
      };
      port2 = {};

      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal("MessageChannel", TestMessageChannel);
    URL.createObjectURL = vi.fn(() => "about:blank");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const mount = session.mount(
      container,
      "renderer:view:example",
      undefined,
      {},
      { revision: "initial" },
      {},
      vi.fn(),
    );
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) throw new Error("Sandbox frame is missing");
    expect(iframe.style.visibility).toBe("hidden");
    expect(iframe.style.display).toBe("block");
    vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(
      () => undefined,
    );

    iframe.dispatchEvent(new Event("load"));
    channels[0]?.port1.onmessage?.({
      data: {
        definition: { contributions: [], renderers: [] },
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      },
    } as MessageEvent);
    await Promise.resolve();
    const initialRender = channels[0]?.port1.postMessage.mock.calls.find(
      ([request]) => request.type === "render",
    )?.[0];
    expect(initialRender?.host).toEqual({ revision: "initial" });
    expect(iframe.style.visibility).toBe("hidden");
    channels[0]?.port1.onmessage?.({
      data: { id: "unknown-render", type: "ready" },
    } as MessageEvent);
    expect(iframe.style.visibility).toBe("hidden");
    channels[0]?.port1.onmessage?.({
      data: { id: initialRender.id, type: "ready" },
    } as MessageEvent);
    expect(iframe.style.visibility).toBe("visible");

    mount.update({ revision: "latest" }, {});
    iframe.dispatchEvent(new Event("load"));
    expect(iframe.style.visibility).toBe("hidden");
    expect(channels[0]?.port1.close).toHaveBeenCalledOnce();
    channels[1]?.port1.onmessage?.({
      data: {
        definition: { contributions: [], renderers: [] },
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      },
    } as MessageEvent);

    expect(channels[1]?.port1.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        host: { revision: "latest" },
        id: initialRender.id,
        type: "render",
      }),
    );
    expect(iframe.style.visibility).toBe("hidden");
    channels[1]?.port1.onmessage?.({
      data: { id: initialRender.id, type: "ready" },
    } as MessageEvent);
    expect(iframe.style.visibility).toBe("visible");

    mount.dispose();
    session.dispose();
  });

  it("starts a renderer with host updates received during registration", async () => {
    const channels: Array<{
      port1: {
        close: ReturnType<typeof vi.fn>;
        onmessage: ((event: MessageEvent) => void) | null;
        postMessage: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
      };
      port2: object;
    }> = [];
    class TestMessageChannel {
      port1 = {
        close: vi.fn(),
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
        start: vi.fn(),
      };
      port2 = {};

      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal("MessageChannel", TestMessageChannel);
    URL.createObjectURL = vi.fn(() => "about:blank");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const initialCapability = vi.fn();
    const latestCapability = vi.fn();
    const mount = session.mount(
      container,
      "renderer:view:example",
      undefined,
      {},
      { revision: "initial" },
      { capability: initialCapability },
      vi.fn(),
    );
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) throw new Error("Sandbox frame is missing");
    vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(
      () => undefined,
    );

    mount.update(
      { revision: "latest" },
      { capability: latestCapability },
    );
    iframe.dispatchEvent(new Event("load"));
    channels[0]?.port1.onmessage?.({
      data: {
        definition: { contributions: [], renderers: [] },
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      },
    } as MessageEvent);
    await Promise.resolve();

    const renderRequest = channels[0]?.port1.postMessage.mock.calls.find(
      ([request]) => request.type === "render",
    )?.[0];
    expect(renderRequest?.host).toEqual({ revision: "latest" });

    channels[0]?.port1.onmessage?.({
      data: {
        args: [],
        id: "host-call-1",
        method: "capability",
        parentId: renderRequest.id,
        type: "host-call",
      },
    } as MessageEvent);
    await vi.waitFor(() => expect(latestCapability).toHaveBeenCalledOnce());
    expect(initialCapability).not.toHaveBeenCalled();

    channels[0]?.port1.onmessage?.({
      data: { id: renderRequest.id, type: "ready" },
    } as MessageEvent);
    mount.dispose();
    session.dispose();
  });

  it("waits for sandbox cleanup before removing the frame", async () => {
    const channels: Array<{
      port1: {
        close: ReturnType<typeof vi.fn>;
        onmessage: ((event: MessageEvent) => void) | null;
        postMessage: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
      };
      port2: object;
    }> = [];
    class TestMessageChannel {
      port1 = {
        close: vi.fn(),
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
        start: vi.fn(),
      };
      port2 = {};

      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal("MessageChannel", TestMessageChannel);
    URL.createObjectURL = vi.fn(() => "about:blank");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const registration = session.start();
    const iframe = document.querySelector("iframe");
    if (!iframe) throw new Error("Sandbox frame is missing");
    const remove = vi.spyOn(iframe, "remove");
    if (!iframe.contentWindow) throw new Error("Sandbox window is missing");
    vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(
      () => undefined,
    );
    iframe.dispatchEvent(new Event("load"));
    channels[0]?.port1.onmessage?.({
      data: {
        definition: { contributions: [], renderers: [] },
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      },
    } as MessageEvent);
    await registration;

    const deactivation = session.deactivate();
    const request = channels[0]?.port1.postMessage.mock.calls.find(
      ([message]) => message.type === "dispose",
    )?.[0];
    expect(request).toBeDefined();
    expect(remove).not.toHaveBeenCalled();
    channels[0]?.port1.onmessage?.({
      data: { id: request.id, type: "ready" },
    } as MessageEvent);
    await deactivation;

    expect(remove).toHaveBeenCalledOnce();
    expect(channels[0]?.port1.close).toHaveBeenCalledOnce();
  });

  it("waits for renderer cleanup already started by an unmount", async () => {
    const channels: Array<{
      port1: {
        close: ReturnType<typeof vi.fn>;
        onmessage: ((event: MessageEvent) => void) | null;
        postMessage: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
      };
      port2: object;
    }> = [];
    class TestMessageChannel {
      port1 = {
        close: vi.fn(),
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
        start: vi.fn(),
      };
      port2 = {};

      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal("MessageChannel", TestMessageChannel);
    URL.createObjectURL = vi.fn(() => "about:blank");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const registration = session.start();
    const control = document.body.querySelector("iframe");
    if (!control?.contentWindow) throw new Error("Control frame is missing");
    vi.spyOn(control.contentWindow, "postMessage").mockImplementation(
      () => undefined,
    );
    control.dispatchEvent(new Event("load"));
    channels[0]?.port1.onmessage?.({
      data: {
        definition: { contributions: [], renderers: [] },
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      },
    } as MessageEvent);
    await registration;

    const container = document.createElement("div");
    document.body.append(container);
    const mount = session.mount(
      container,
      "renderer:view:example",
      undefined,
      {},
      {},
      {},
      vi.fn(),
    );
    const renderer = container.querySelector("iframe");
    if (!renderer?.contentWindow) throw new Error("Renderer frame is missing");
    vi.spyOn(renderer.contentWindow, "postMessage").mockImplementation(
      () => undefined,
    );
    renderer.dispatchEvent(new Event("load"));
    channels[1]?.port1.onmessage?.({
      data: {
        definition: { contributions: [], renderers: [] },
        protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
        type: "registered",
      },
    } as MessageEvent);
    await Promise.resolve();

    mount.dispose();
    const rendererDisposal = channels[1]?.port1.postMessage.mock.calls.find(
      ([message]) => message.type === "dispose",
    )?.[0];
    expect(rendererDisposal).toBeDefined();

    const settled = vi.fn();
    const deactivation = session.deactivate().then(settled);
    const controlDisposal = channels[0]?.port1.postMessage.mock.calls.find(
      ([message]) => message.type === "dispose",
    )?.[0];
    expect(controlDisposal).toBeDefined();
    channels[0]?.port1.onmessage?.({
      data: { id: controlDisposal.id, type: "ready" },
    } as MessageEvent);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    channels[1]?.port1.onmessage?.({
      data: { id: rendererDisposal.id, type: "ready" },
    } as MessageEvent);
    await deactivation;
    expect(settled).toHaveBeenCalledOnce();
  });

  it("rejects renderer mounts after deactivation", async () => {
    URL.createObjectURL = vi.fn(() => "blob:sandbox-renderer");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );

    await session.deactivate();

    expect(() =>
      session.mount(
        document.createElement("div"),
        "renderer:view:example",
        undefined,
        {},
        {},
        {},
        vi.fn(),
      ),
    ).toThrow("Extension sandbox disposed");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports errors from an active renderer frame", async () => {
    URL.createObjectURL = vi.fn(() => "blob:sandbox-renderer");
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const container = document.createElement("div");
    const onError = vi.fn();

    session.mount(
      container,
      "renderer:view:example",
      undefined,
      {},
      {},
      {},
      onError,
    );
    container.querySelector("iframe")?.dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Extension "example.plugin" sandbox failed',
      }),
    );
    session.dispose();
  });

  it("relaxes only the declared local srcdoc renderer frame", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:sandbox-${blobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
    const session = new ExternalPluginSandboxSession(
      "example.plugin",
      new TextEncoder().encode("void 0"),
    );
    const container = document.createElement("div");
    const mount = session.mount(
      container,
      "renderer:content:example",
      "local-srcdoc",
      {},
      {},
      {},
      vi.fn(),
    );

    const html = await blobs.at(-1)?.text();
    expect(html).toContain("script-src blob: 'unsafe-inline'");
    expect(html).toContain("connect-src blob:");
    expect(html).toContain("frame-src 'self' blob:");
    expect(html).toContain("font-src data: blob:");
    expect(html).toContain("media-src data: blob:");
    expect(html).not.toContain("connect-src 'none'");
    expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe(
      "allow-scripts",
    );

    mount.dispose();
    session.dispose();
  });
});
