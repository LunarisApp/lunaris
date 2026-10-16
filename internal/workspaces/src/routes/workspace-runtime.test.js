/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  markWorkspaceRuntimeReady,
  useWorkspaceRuntimeController,
} from "./workspace-runtime";
import { useWorkspacePluginPreload } from "./workspace-plugin-preload";

const {
  loadPluginMock,
  loadWorkspacePluginIdsMock,
  logDebugMock,
  logErrorMock,
  repairFileAttachmentPointersMock,
  startAttachmentQueueMock,
  stopAttachmentQueueMock,
} = vi.hoisted(() => ({
  loadPluginMock: vi.fn(),
  loadWorkspacePluginIdsMock: vi.fn(),
  logDebugMock: vi.fn(),
  logErrorMock: vi.fn(),
  repairFileAttachmentPointersMock: vi.fn(),
  startAttachmentQueueMock: vi.fn(),
  stopAttachmentQueueMock: vi.fn(),
}));

vi.mock("evlog", () => ({
  log: {
    debug: logDebugMock,
    error: logErrorMock,
  },
  parseError: (error) => error,
}));

vi.mock("@repo/data/core", () => {
  const db = { name: "db" };
  return {
    usePowerSync: () => db,
    useSyncAccess: () => "cloud",
  };
});

vi.mock("@repo/data/features/attachments", () => ({
  startAttachmentQueue: startAttachmentQueueMock,
  stopAttachmentQueue: stopAttachmentQueueMock,
}));

vi.mock("@repo/data/features/files", () => ({
  createFileAttachmentWatcher: vi.fn(() => vi.fn()),
  repairFileAttachmentPointers: repairFileAttachmentPointersMock,
}));

vi.mock("@repo/features/api", () => ({
  useApi: () => ({ baseUrl: "https://api.example.com" }),
}));

vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace_1" }),
}));

vi.mock("@repo/features/entitlements", () => ({
  useEntitlements: () => ({ can: () => true }),
}));

vi.mock("../extensions/host/loader", () => ({
  loadWorkspacePluginIds: loadWorkspacePluginIdsMock,
}));

vi.mock("../extensions/registry", () => ({
  ALL_PLUGIN_IDS: ["lunaris.rich-text"],
  PLUGIN_METADATA: { "lunaris.rich-text": { id: "lunaris.rich-text" } },
  loadPlugin: loadPluginMock,
  loadPlugins: vi.fn(),
}));

describe("useWorkspaceRuntimeController", () => {
  beforeEach(() => {
    loadWorkspacePluginIdsMock.mockReset();
    logDebugMock.mockReset();
    logErrorMock.mockReset();
    repairFileAttachmentPointersMock.mockReset();
    repairFileAttachmentPointersMock.mockResolvedValue();
    startAttachmentQueueMock.mockReset();
    startAttachmentQueueMock.mockResolvedValue({});
    stopAttachmentQueueMock.mockReset();
    stopAttachmentQueueMock.mockResolvedValue();
  });

  it("loads plugins and stays in loading until the shell finishes init", async () => {
    loadWorkspacePluginIdsMock.mockResolvedValue(["lunaris.rich-text"]);

    const { result } = renderHook(() =>
      useWorkspaceRuntimeController(["lunaris.rich-text"])
    );

    await waitFor(() => {
      expect(result.current.enabledPluginIds).toEqual(["lunaris.rich-text"]);
    });

    expect(result.current.bootState).toBe("loading");
  });

  it("keeps initial boot state while available extensions change", async () => {
    loadWorkspacePluginIdsMock.mockResolvedValue(["lunaris.rich-text"]);

    const { result, rerender } = renderHook(
      ({ extensionIds }) => useWorkspaceRuntimeController(extensionIds),
      { initialProps: { extensionIds: ["lunaris.rich-text"] } }
    );

    await waitFor(() => {
      expect(result.current.enabledPluginIds).toEqual(["lunaris.rich-text"]);
    });

    rerender({ extensionIds: ["lunaris.rich-text", "lunaris.sheet"] });

    expect(result.current.enabledPluginIds).toEqual(["lunaris.rich-text"]);
    expect(result.current.allExtensionIds).toEqual([
      "lunaris.rich-text",
      "lunaris.sheet",
    ]);
    expect(loadWorkspacePluginIdsMock).toHaveBeenCalledOnce();
  });

  it("marks the organization ready for performance measurement", () => {
    const mark = vi.spyOn(globalThis.performance, "mark");

    markWorkspaceRuntimeReady();

    expect(mark).toHaveBeenCalledWith("lunaris:workspace-runtime-ready");
    mark.mockRestore();
  });

  it("does not fail organization boot when attachment repair fails", async () => {
    let rejectRepair;
    repairFileAttachmentPointersMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRepair = reject;
      })
    );
    loadWorkspacePluginIdsMock.mockResolvedValue(["lunaris.rich-text"]);

    const { result } = renderHook(() =>
      useWorkspaceRuntimeController(["lunaris.rich-text"])
    );

    await waitFor(() => {
      expect(result.current.enabledPluginIds).toEqual(["lunaris.rich-text"]);
    });
    act(() => result.current.markReady());
    expect(result.current.bootState).toBe("ready");

    await act(async () => {
      rejectRepair(new Error("attachment repair failed"));
    });

    expect(result.current.bootState).toBe("ready");
    expect(result.current.bootError).toBeNull();
    expect(logErrorMock).toHaveBeenCalledWith({
      action: "workspace_runtime.boot",
      outcome: "failure",
      workspace: { id: "workspace_1" },
      boot: { stage: "attachment_queue" },
      error: expect.objectContaining({ message: "attachment repair failed" }),
    });
  });

  it("surfaces plugin load failures as a visible boot error", async () => {
    loadWorkspacePluginIdsMock.mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() =>
      useWorkspaceRuntimeController(["lunaris.rich-text"])
    );

    await waitFor(() => {
      expect(result.current.bootState).toBe("error");
    });

    expect(result.current.bootError).toBe("nope");
    expect(logErrorMock).toHaveBeenCalledWith({
      action: "workspace_runtime.boot",
      outcome: "failure",
      workspace: { id: "workspace_1" },
      boot: { stage: "read_plugin_ids" },
      error: expect.objectContaining({ message: "nope" }),
    });
  });

  it("retries plugin boot after a failure", async () => {
    loadWorkspacePluginIdsMock.mockRejectedValue(new Error("first failure"));

    const { result } = renderHook(() =>
      useWorkspaceRuntimeController(["lunaris.rich-text"])
    );

    await waitFor(() => {
      expect(result.current.bootState).toBe("error");
    });

    act(() => {
      loadWorkspacePluginIdsMock.mockResolvedValue(["lunaris.rich-text"]);
      result.current.retryBoot();
    });

    await waitFor(() => {
      expect(result.current.enabledPluginIds).toEqual(["lunaris.rich-text"]);
    });

    expect(loadWorkspacePluginIdsMock.mock.calls.length).toBeGreaterThanOrEqual(
      2
    );
  });
});

describe("useWorkspacePluginPreload", () => {
  beforeEach(() => {
    loadWorkspacePluginIdsMock.mockReset();
    logDebugMock.mockReset();
    logErrorMock.mockReset();
    loadPluginMock.mockReset();
    loadPluginMock.mockResolvedValue({ id: "lunaris.rich-text", plugin: {} });
    loadWorkspacePluginIdsMock.mockResolvedValue(["lunaris.rich-text"]);
  });

  it("loads entitled workspace plugins without waiting for organization boot", async () => {
    const { result } = renderHook(() =>
      useWorkspacePluginPreload(["lunaris.rich-text"])
    );

    act(() => result.current("workspace_1"));

    await waitFor(() => {
      expect(loadWorkspacePluginIdsMock).toHaveBeenCalledWith({
        allExtensionIds: ["lunaris.rich-text"],
        db: { name: "db" },
        defaultExtensionIds: ["lunaris.rich-text"],
        workspaceId: "workspace_1",
      });
      expect(loadPluginMock).toHaveBeenCalledWith("lunaris.rich-text");
    });
  });

  it("deduplicates concurrent preload intent for one workspace", async () => {
    let resolvePluginIds;
    loadWorkspacePluginIdsMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePluginIds = resolve;
      })
    );
    const { result } = renderHook(() =>
      useWorkspacePluginPreload(["lunaris.rich-text"])
    );

    act(() => {
      result.current("workspace_1");
      result.current("workspace_1");
    });

    expect(loadWorkspacePluginIdsMock).toHaveBeenCalledOnce();
    resolvePluginIds(["lunaris.rich-text"]);
    await waitFor(() => expect(loadPluginMock).toHaveBeenCalledOnce());
  });

  it("logs preload failures without blocking later retries", async () => {
    loadPluginMock.mockRejectedValueOnce(new Error("chunk unavailable"));
    const { result } = renderHook(() =>
      useWorkspacePluginPreload(["lunaris.rich-text"])
    );

    act(() => result.current("workspace_1"));

    await waitFor(() => {
      expect(logDebugMock).toHaveBeenCalledWith({
        action: "workspace_runtime.preload",
        outcome: "failure",
        workspace: { id: "workspace_1" },
        error: expect.objectContaining({ message: "chunk unavailable" }),
      });
    });

    act(() => result.current("workspace_1"));
    await waitFor(() =>
      expect(loadWorkspacePluginIdsMock).toHaveBeenCalledTimes(2)
    );
  });
});
