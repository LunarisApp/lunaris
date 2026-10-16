import type { ExtensionMarketplace } from "@lunarisapp/plugin-sdk/marketplace";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cachePluginRelease,
  fetchPluginCatalog,
  installations,
  loadExternalPluginDescriptor,
  loadExternalPluginIcon,
  loadExternalPlugin,
  onlineSubscribers,
  platform,
  readCachedPluginCatalog,
  registries,
  registriesQuery,
  workspaceExtensionsQuery,
} = vi.hoisted(() => {
  const onlineSubscribers: Array<() => void> = [];
  return {
    cachePluginRelease: vi.fn(),
    fetchPluginCatalog: vi.fn(),
    loadExternalPluginDescriptor: vi.fn(),
    loadExternalPluginIcon: vi.fn(),
    loadExternalPlugin: vi.fn(),
    installations: [
      {
        descriptorBytes: 100,
        descriptorSha256: "b".repeat(64),
        descriptorUrl: "https://plugins.example/release.json",
        enabled: true,
        extensionId: "com.example.tasks",
        registryId: "registry-1",
        version: "1.0.0",
      },
    ],
    onlineSubscribers,
    platform: {
      network: {
        isOnline: vi.fn(() => true),
        subscribeOnline: vi.fn((listener: () => void) => {
          onlineSubscribers.push(listener);
          return () => {
            const index = onlineSubscribers.indexOf(listener);
            if (index >= 0) {
              onlineSubscribers.splice(index, 1);
            }
          };
        }),
      },
      plugins: {},
    },
    registriesQuery: vi.fn(),
    workspaceExtensionsQuery: vi.fn(),
    readCachedPluginCatalog: vi.fn(),
    registries: [
      {
        id: "registry-1",
        manifestUrl: "https://plugins.example/marketplace.json",
      },
    ],
  };
});

vi.mock("@repo/data/features/workspace-extensions", () => {
  let previousData: unknown;
  let previousRows: Record<string, unknown>[] = [];
  return {
    resolveEnabledWorkspaceExtensionIds: (
      rows: Array<{ enabled: number; extension_id: string }>,
      defaults: string[]
    ) =>
      new Set(
        rows.length
          ? rows
              .filter((row) => Boolean(row.enabled))
              .map((row) => row.extension_id)
          : defaults
      ),
    toWorkspaceExtensionInstallation: (row: Record<string, unknown>) =>
      row.registry_id && row.version
        ? {
            descriptorBytes: row.descriptor_bytes ?? null,
            descriptorSha256: row.descriptor_sha256 ?? null,
            descriptorUrl: row.descriptor_url ?? null,
            enabled: Boolean(row.enabled),
            extensionId: row.extension_id,
            registryId: row.registry_id,
            version: row.version,
          }
        : null,
    useWorkspaceExtensionsQuery: () => {
      const query = workspaceExtensionsQuery();
      if (query.data !== previousData) {
        previousData = query.data;
        previousRows = query.data.map(
          (installation: Record<string, unknown>) => ({
            descriptor_bytes: installation.descriptorBytes,
            descriptor_sha256: installation.descriptorSha256,
            descriptor_url: installation.descriptorUrl,
            enabled: installation.enabled ? 1 : 0,
            extension_id: installation.extensionId,
            registry_id: installation.registryId,
            version: installation.version,
          })
        );
      }
      return {
        ...query,
        data: previousRows,
      };
    },
  };
});

vi.mock("@repo/data/features/organization-extension-registries", () => ({
  useOrganizationExtensionRegistriesQuery: () => registriesQuery(),
}));

vi.mock("@repo/features/auth/context", () => ({
  useAuth: () => ({
    useActiveOrganization: () => ({ data: { id: "organization-1" } }),
  }),
}));

vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: () => ({ allowed: true, pending: false }),
}));

vi.mock("@repo/platform", () => ({
  OFFICIAL_EXTENSION_MARKETPLACE_URL:
    "https://plugins.example/marketplace.json",
  useOnlineStatus: () => true,
  usePlatform: () => platform,
}));

vi.mock("evlog", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
  parseError: (error: unknown) => error,
}));

vi.mock("./external", () => ({
  cachePluginRelease,
  fetchPluginCatalog,
  loadExternalPluginDescriptor,
  loadExternalPluginIcon,
  loadExternalPlugin,
  readCachedPluginCatalog,
}));

vi.mock("./registry", () => ({
  ALL_PLUGIN_IDS: ["lunaris.rich-text"],
  PLUGIN_METADATA: {
    "lunaris.rich-text": {
      id: "lunaris.rich-text",
      name: "Rich text",
      version: "1.0.0",
    },
  },
  PLUGIN_MANIFESTS: {
    "lunaris.rich-text": {
      description: "Rich text",
      developer: "Lunaris",
      id: "lunaris.rich-text",
      name: "Rich text",
      api: "^0.9.0",
      permissions: [],
      version: "1.0.0",
    },
  },
  loadPlugin: vi.fn(),
  loadPlugins: vi.fn(),
}));

import { useAvailablePluginRegistry } from "./access";

const catalog: ExtensionMarketplace = {
  displayName: "Example",
  enabled: true,
  extensions: [],
  generatedAt: "2026-08-09T10:00:00.000Z",
  name: "example",
  schemaVersion: 1,
};

const loadableCatalog: ExtensionMarketplace = {
  ...catalog,
  extensions: [
    {
      description: "Tasks",
      developer: "Example",
      id: "com.example.tasks",
      latestVersion: "1.0.0",
      name: "Tasks",
      repository: "https://github.com/example/tasks",
      versions: [
        {
          descriptor: {
            bytes: 100,
            sha256: "b".repeat(64),
            url: "https://plugins.example/release.json",
          },
          runtime: { kind: "iframe", protocol: 6 },
          api: "^0.9.0",
          status: "active",
          version: "1.0.0",
        },
      ],
    },
  ],
};

const releaseDescriptor = {
  icon: null,
  manifest: {
    description: "Tasks",
    developer: "Example",
    id: "com.example.tasks",
    name: "Tasks",
    api: "^0.9.0",
    permissions: [],
    version: "1.0.0",
  },
  runtime: { kind: "iframe", protocol: 6 },
  script: { sha256: "a".repeat(64), size: 1, url: "https://example/script.js" },
  api: "^0.9.0",
  permissions: [],
  status: "active",
};

describe("useAvailablePluginRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onlineSubscribers.splice(0);
    fetchPluginCatalog.mockReset();
    cachePluginRelease.mockReset();
    cachePluginRelease.mockResolvedValue(releaseDescriptor);
    loadExternalPluginDescriptor.mockReset();
    loadExternalPluginIcon.mockReset();
    loadExternalPlugin.mockReset();
    readCachedPluginCatalog.mockReset();
    readCachedPluginCatalog.mockResolvedValue(null);
    loadExternalPluginDescriptor.mockResolvedValue(releaseDescriptor);
    loadExternalPluginIcon.mockResolvedValue(null);
    workspaceExtensionsQuery.mockReturnValue({ data: [], isLoading: false });
    registriesQuery.mockReturnValue({ data: registries, isLoading: false });
  });

  it("skips catalog loading when no external extensions are installed", () => {
    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );

    expect(result.current.pending).toBe(false);
    expect(fetchPluginCatalog).not.toHaveBeenCalled();
  });

  it("waits for directory sync before resolving external extensions", async () => {
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });
    registriesQuery.mockReturnValue({ data: [], isLoading: true });
    const { result, rerender } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await act(async () => {});
    expect(result.current.pending).toBe(true);
    expect(fetchPluginCatalog).not.toHaveBeenCalled();
    expect(readCachedPluginCatalog).not.toHaveBeenCalled();
    expect(loadExternalPluginDescriptor).not.toHaveBeenCalled();
    registriesQuery.mockReturnValue({ data: registries, isLoading: false });
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    readCachedPluginCatalog.mockResolvedValue(loadableCatalog);
    rerender();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(fetchPluginCatalog).toHaveBeenCalledWith(
      platform.plugins,
      registries[0]!.manifestUrl
    );
  });

  it("keeps cached external registries usable while sync catches up", async () => {
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });
    registriesQuery.mockReturnValue({ data: registries, isLoading: true });
    readCachedPluginCatalog.mockResolvedValue(loadableCatalog);
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(readCachedPluginCatalog).toHaveBeenCalled();
  });

  it("releases pending after cached catalog read without waiting for network", async () => {
    let resolveCatalog: (value: PluginCatalog) => void = () => undefined;
    fetchPluginCatalog.mockReturnValue(
      new Promise<PluginCatalog>((resolve) => {
        resolveCatalog = resolve;
      })
    );
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(fetchPluginCatalog).toHaveBeenCalledOnce();
    await act(async () => resolveCatalog(catalog));
  });

  it("releases pending state when the initial catalog load fails", async () => {
    fetchPluginCatalog.mockRejectedValue(new Error("offline"));
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );

    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it("does not make marketplace installations workspace defaults", async () => {
    fetchPluginCatalog.mockResolvedValue(catalog);
    workspaceExtensionsQuery.mockReturnValue({
      data: [
        ...installations,
        { ...installations[0], extensionId: "lunaris.excalidraw" },
      ],
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.defaultExtensionIds).toEqual(["lunaris.rich-text"]);
  });

  it("keeps disabled external releases declared but inactive", async () => {
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    workspaceExtensionsQuery.mockReturnValue({
      data: [{ ...installations[0], enabled: false }],
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.allExtensionIds).toContain("com.example.tasks");
    expect(result.current.enabledExtensionIds).not.toContain(
      "com.example.tasks"
    );
    expect(result.current.runtimeRevisions["com.example.tasks"]).toContain(
      "1.0.0"
    );
  });

  it("loads a newly installed release manifest while its cache is warming", async () => {
    let resolveCache: (value: typeof releaseDescriptor) => void = () =>
      undefined;
    cachePluginRelease.mockReturnValue(
      new Promise((resolve) => {
        resolveCache = resolve;
      })
    );
    readCachedPluginCatalog.mockResolvedValue(loadableCatalog);
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(loadExternalPluginDescriptor).toHaveBeenCalledWith(
      expect.any(Object),
      platform.plugins,
      { allowNetwork: true }
    );
    expect(result.current.extensionAvailability["com.example.tasks"]).toBe(
      "available"
    );

    await act(async () => resolveCache(releaseDescriptor));
  });

  it("lets the runtime retry an online manifest preload failure", async () => {
    readCachedPluginCatalog.mockResolvedValue(loadableCatalog);
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    loadExternalPluginDescriptor.mockRejectedValue(new Error("network failed"));
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.extensionAvailability["com.example.tasks"]).toBe(
      "available"
    );
  });

  it("disposes a plugin that loads after unmount", async () => {
    let resolveLoad: (value: { dispose: () => void; plugin: never }) => void =
      () => undefined;
    const dispose = vi.fn();
    loadExternalPlugin.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });
    const { result, unmount } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await waitFor(() => expect(result.current.pending).toBe(false));

    const request = result.current.loadPlugin("com.example.tasks");
    unmount();
    resolveLoad({ dispose, plugin: {} as never });
    await request;

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps a shared external extension load alive for concurrent callers", async () => {
    const dispose = vi.fn();
    const plugin = {} as never;
    loadExternalPlugin.mockResolvedValue({ dispose, plugin });
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await waitFor(() => expect(result.current.pending).toBe(false));

    let loadedPlugins: Awaited<ReturnType<typeof result.current.loadPlugin>>[] =
      [];
    await act(async () => {
      loadedPlugins = await Promise.all([
        result.current.loadPlugin("com.example.tasks"),
        result.current.loadPlugin("com.example.tasks"),
      ]);
    });

    expect(loadExternalPlugin).toHaveBeenCalledOnce();
    expect(loadedPlugins).toEqual([
      { id: "com.example.tasks", plugin },
      { id: "com.example.tasks", plugin },
    ]);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("unloads a blocked release and restores its declaration when active again", async () => {
    let resolveRefresh: (value: typeof releaseDescriptor) => void = () =>
      undefined;
    cachePluginRelease.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    readCachedPluginCatalog.mockResolvedValue(loadableCatalog);
    fetchPluginCatalog.mockResolvedValue(loadableCatalog);
    workspaceExtensionsQuery.mockReturnValue({
      data: installations,
      isLoading: false,
    });
    const dispose = vi.fn();
    const plugin = {} as never;
    loadExternalPlugin.mockResolvedValue({ dispose, plugin });
    const { result } = renderHook(() =>
      useAvailablePluginRegistry("workspace-1")
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    await act(async () => {
      await expect(
        result.current.loadPlugin("com.example.tasks")
      ).resolves.toEqual({
        id: "com.example.tasks",
        plugin,
      });
    });

    await act(async () => {
      resolveRefresh({ ...releaseDescriptor, status: "blocked" });
    });

    await waitFor(() => {
      expect(dispose).not.toHaveBeenCalled();
      expect(result.current.extensionAvailability["com.example.tasks"]).toBe(
        "blocked"
      );
    });
    expect(
      result.current.extensionManifests["com.example.tasks"]
    ).toBeUndefined();

    cachePluginRelease.mockResolvedValue(releaseDescriptor);
    await act(async () => {
      onlineSubscribers[0]?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.extensionAvailability["com.example.tasks"]).toBe(
        "available"
      );
      expect(result.current.extensionManifests["com.example.tasks"]).toEqual(
        releaseDescriptor.manifest
      );
    });
  });
});
