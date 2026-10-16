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

function setup(loadPlugin = vi.fn(async () => ({ plugin }))) {
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
