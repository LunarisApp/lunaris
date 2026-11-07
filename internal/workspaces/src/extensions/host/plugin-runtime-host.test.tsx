// @vitest-environment happy-dom

import { definePlugin } from "@lunarisapp/plugin-sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePluginRuntimeHost } from "./plugin-runtime-host";

const lifecycle = vi.hoisted(() => ({
  cleanupPlugins: vi.fn(),
  disablePlugin: vi.fn(),
  initializePlugins: vi.fn(),
  reloadPlugin: vi.fn(),
}));

vi.mock("./provider", () => ({
  usePluginHostLifecycle: () => lifecycle,
}));

const plugin = definePlugin({
  manifest: {
    api: "^0.9.0",
    description: "Plugin",
    developer: "Acme",
    id: "acme.plugin",
    name: "Plugin",
    permissions: [],
    version: "1.0.0",
  },
  activate() {},
});

function setup(
  loadPlugin: Parameters<typeof usePluginRuntimeHost>[0]["loadPlugin"] = vi.fn(
    async () => ({ plugin })
  )
) {
  const unloadPlugin = vi.fn();
  const unregisterPlugin = vi.fn();
  const { result } = renderHook(() =>
    usePluginRuntimeHost({
      resourceViewLayoutWrapper: undefined,
      i18n: undefined,
      loadPlugin,
      registerRenderers: vi.fn(),
      unloadPlugin,
      unregisterPlugin,
      unregisterRenderer: vi.fn(),
    })
  );
  return { result, unloadPlugin, unregisterPlugin };
}

beforeEach(() => {
  lifecycle.cleanupPlugins.mockReset().mockResolvedValue(undefined);
  lifecycle.disablePlugin.mockReset().mockResolvedValue(undefined);
  lifecycle.initializePlugins.mockReset();
  lifecycle.reloadPlugin.mockReset();
});

describe("plugin runtime host", () => {
  it("loads revisions concurrently, isolates failures, and activates in input order", async () => {
    const second = definePlugin({
      manifest: { ...plugin.manifest, id: "acme.second" },
      activate() {},
    });
    const releases = new Map<string, () => void>();
    const loadPlugin = vi.fn(async (id: string) => {
      await new Promise<void>((resolve) => releases.set(id, resolve));
      if (id === "acme.failed") {
        throw new Error("download failed");
      }
      return { plugin: id === plugin.manifest.id ? plugin : second };
    });
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
      { pluginId: second.manifest.id, success: true },
    ]);
    const { result } = setup(loadPlugin);
    const ids = [plugin.manifest.id, second.manifest.id, "acme.failed"];
    const pending = result.current.reconcile({
      enabledExtensionIds: ids,
      runtimeRevisions: Object.fromEntries(ids.map((id) => [id, "release-1"])),
    });

    expect(loadPlugin).toHaveBeenCalledTimes(3);
    releases.get(second.manifest.id)!();
    releases.get("acme.failed")!();
    expect(lifecycle.initializePlugins).not.toHaveBeenCalled();
    releases.get(plugin.manifest.id)!();

    expect(await pending).toEqual({
      "acme.failed": new Error("download failed"),
    });
    expect(lifecycle.initializePlugins).toHaveBeenCalledWith(
      [plugin, second],
      expect.any(Object)
    );
  });

  it("unloads every concurrent load completed after disposal", async () => {
    const second = definePlugin({
      manifest: { ...plugin.manifest, id: "acme.second" },
      activate() {},
    });
    const releases: Array<() => void> = [];
    const loadPlugin = vi.fn(async (id: string) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return { plugin: id === plugin.manifest.id ? plugin : second };
    });
    const { result, unloadPlugin } = setup(loadPlugin);
    const ids = [plugin.manifest.id, second.manifest.id];
    const pending = result.current.reconcile({
      enabledExtensionIds: ids,
      runtimeRevisions: Object.fromEntries(ids.map((id) => [id, "release-1"])),
    });
    expect(loadPlugin).toHaveBeenCalledTimes(2);
    act(() => result.current.dispose());
    for (const release of releases) {
      release();
    }
    const errors = await pending;

    expect(lifecycle.initializePlugins).not.toHaveBeenCalled();
    for (const id of ids) {
      expect(errors[id]?.message).toContain("cancelled");
      expect(unloadPlugin).toHaveBeenCalledWith(id, "release-1");
    }
  });

  it("replaces a ready revision while later downloads are still pending", async () => {
    const second = definePlugin({
      manifest: { ...plugin.manifest, id: "acme.second" },
      activate() {},
    });
    let finishDownload = () => {};
    const download = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const loadPlugin = vi.fn(async (id: string) => {
      if (id === second.manifest.id) {
        await download;
        return { plugin: second };
      }
      return { plugin };
    });
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
    ]);
    lifecycle.reloadPlugin.mockResolvedValue({
      pluginId: plugin.manifest.id,
      success: true,
    });
    const { result } = setup(loadPlugin);
    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: second.manifest.id, success: true },
    ]);
    const pending = result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id, second.manifest.id],
      runtimeRevisions: {
        [plugin.manifest.id]: "release-2",
        [second.manifest.id]: "release-1",
      },
    });

    try {
      await waitFor(() =>
        expect(lifecycle.reloadPlugin).toHaveBeenCalledOnce()
      );
    } finally {
      finishDownload();
      await pending;
    }
  });

  it("cleans additions whose activation finishes after disposal", async () => {
    let finishActivation = () => {};
    lifecycle.initializePlugins.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishActivation = resolve;
      });
      return [{ pluginId: plugin.manifest.id, success: true }];
    });
    const { result, unloadPlugin } = setup();
    const pending = result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });
    await waitFor(() => expect(lifecycle.initializePlugins).toHaveBeenCalled());
    act(() => result.current.dispose());
    finishActivation();
    const errors = await pending;

    expect(errors[plugin.manifest.id]?.message).toContain("cancelled");
    expect(lifecycle.cleanupPlugins).toHaveBeenCalledWith([plugin]);
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id, "release-1");
  });

  it("does not retain replacements or activate queued additions after disposal", async () => {
    const second = definePlugin({
      manifest: { ...plugin.manifest, id: "acme.second" },
      activate() {},
    });
    const loadPlugin = vi.fn(async (id: string) => ({
      plugin: id === plugin.manifest.id ? plugin : second,
    }));
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
      { pluginId: second.manifest.id, success: true },
    ]);
    let finishReplacement = () => {};
    lifecycle.reloadPlugin.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishReplacement = resolve;
      });
      return { pluginId: plugin.manifest.id, success: true };
    });
    const { result, unloadPlugin } = setup(loadPlugin);
    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });
    lifecycle.initializePlugins.mockClear();
    const target = {
      enabledExtensionIds: [second.manifest.id, plugin.manifest.id],
      runtimeRevisions: {
        [plugin.manifest.id]: "release-2",
        [second.manifest.id]: "release-1",
      },
    };
    const pending = result.current.reconcile(target);
    await waitFor(() => expect(lifecycle.reloadPlugin).toHaveBeenCalled());
    act(() => result.current.dispose());
    finishReplacement();
    const errors = await pending;

    expect(errors[plugin.manifest.id]?.message).toContain("cancelled");
    expect(errors[second.manifest.id]?.message).toContain("cancelled");
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id, "release-2");
    expect(unloadPlugin).toHaveBeenCalledWith(second.manifest.id, "release-1");
    expect(lifecycle.initializePlugins).not.toHaveBeenCalled();

    // A later reconciliation must reload both, not reuse a disposed replacement.
    loadPlugin.mockClear();
    await result.current.reconcile(target);
    expect(loadPlugin).toHaveBeenCalledTimes(2);
    expect(lifecycle.initializePlugins).toHaveBeenCalledWith(
      [second, plugin],
      expect.any(Object)
    );
  });

  it("unloads definitions that fail initialization", async () => {
    lifecycle.initializePlugins.mockResolvedValue([
      {
        error: new Error("activation failed"),
        pluginId: plugin.manifest.id,
        success: false,
      },
    ]);
    const { result, unloadPlugin } = setup();

    const results = await act(() =>
      result.current.initialize([plugin.manifest.id])
    );

    expect(results[0]).toMatchObject({ success: false });
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id);
  });

  it("cleans initialization that finishes after disposal", async () => {
    let resolveInitialization: (
      results: Array<{
        pluginId: string;
        success: boolean;
      }>
    ) => void = () => undefined;
    lifecycle.initializePlugins.mockReturnValue(
      new Promise((resolve) => {
        resolveInitialization = resolve;
      })
    );
    const { result, unloadPlugin } = setup();
    const initialization = result.current.initialize([plugin.manifest.id]);
    await waitFor(() => expect(lifecycle.initializePlugins).toHaveBeenCalled());

    act(() => result.current.dispose());
    resolveInitialization([{ pluginId: plugin.manifest.id, success: true }]);
    const results = await initialization;

    expect(results[0]).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("cancelled"),
      }),
      success: false,
    });
    expect(lifecycle.cleanupPlugins).toHaveBeenCalledWith([plugin]);
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id);
  });

  it("reconciles only changed extensions", async () => {
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
    ]);
    const { result, unloadPlugin, unregisterPlugin } = setup();

    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });
    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });

    expect(lifecycle.initializePlugins).toHaveBeenCalledOnce();

    await result.current.reconcile({
      enabledExtensionIds: [],
      extensionAvailability: {},
      runtimeRevisions: {},
    });

    expect(lifecycle.disablePlugin).toHaveBeenCalledWith(
      plugin.manifest.id,
      unregisterPlugin
    );
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id, "release-1");
  });

  it("replaces one active revision and unloads the old artifact afterward", async () => {
    const nextPlugin = definePlugin({
      manifest: { ...plugin.manifest, version: "2.0.0" },
      activate() {},
    });
    let loaded = plugin;
    const loadPlugin = vi.fn(async () => ({ plugin: loaded }));
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
    ]);
    lifecycle.reloadPlugin.mockResolvedValue({
      pluginId: plugin.manifest.id,
      success: true,
    });
    const { result, unloadPlugin } = setup(loadPlugin);

    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });
    loaded = nextPlugin;
    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-2" },
    });

    expect(lifecycle.reloadPlugin).toHaveBeenCalledWith(
      nextPlugin,
      expect.any(Object),
      expect.any(Function)
    );
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id, "release-1");
  });

  it("unloads a replacement artifact when reconciliation throws", async () => {
    const nextPlugin = definePlugin({
      manifest: { ...plugin.manifest, version: "2.0.0" },
      activate() {},
    });
    let loaded = plugin;
    const loadPlugin = vi.fn(async () => ({ plugin: loaded }));
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
    ]);
    lifecycle.reloadPlugin.mockRejectedValue(new Error("replace crashed"));
    const { result, unloadPlugin } = setup(loadPlugin);

    await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    });
    loaded = nextPlugin;
    const errors = await result.current.reconcile({
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-2" },
    });

    expect(errors[plugin.manifest.id]?.message).toBe("replace crashed");
    expect(unloadPlugin).toHaveBeenCalledWith(plugin.manifest.id, "release-2");
  });

  it("deactivates an enabled extension when its release becomes unavailable", async () => {
    lifecycle.initializePlugins.mockResolvedValue([
      { pluginId: plugin.manifest.id, success: true },
    ]);
    const { result } = setup();
    const target = {
      enabledExtensionIds: [plugin.manifest.id],
      extensionAvailability: { [plugin.manifest.id]: "available" },
      runtimeRevisions: { [plugin.manifest.id]: "release-1" },
    };
    await result.current.reconcile(target);

    const errors = await result.current.reconcile({
      ...target,
      extensionAvailability: { [plugin.manifest.id]: "blocked" },
    });

    expect(lifecycle.disablePlugin).toHaveBeenCalledWith(
      plugin.manifest.id,
      expect.any(Function)
    );
    expect(errors[plugin.manifest.id]?.message).toContain("blocked");
  });
});
