/** @vitest-environment happy-dom */

import type {
  Panel,
  PanelWindowDescriptor,
} from "@repo/workspaces/grid-layout";
import {
  PanelWindowError,
  type PanelWindowManager,
  type PanelWindowOpenRequest,
} from "@repo/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  moveWorkspacePanelToWindow,
  openWorkspacePanelInNewWindow,
} from "./workspace-panel-window";

const { captureMock, logErrorMock, toastErrorMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  logErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("evlog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("evlog")>()),
  log: { error: logErrorMock },
  parseError: (error: unknown) => error,
}));

vi.mock("posthog-js", () => ({
  default: { capture: captureMock },
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock },
}));

const panel: Panel = {
  id: "panel-1",
  isUnloaded: false,
  lastActiveAt: 1,
  params: { resourceId: "item-1" },
  pluginId: "plugin",
  renderer: "content",
  title: "Document",
};

function createManager(
  open: PanelWindowManager["open"] = vi.fn(() => ({
    close: vi.fn(),
    ready: Promise.resolve(),
  }))
): PanelWindowManager {
  return {
    acknowledge: vi.fn(async () => undefined),
    currentWindowId: "main",
    open,
    platform: "web",
  };
}

function move(manager?: PanelWindowManager, movedPanel = panel) {
  return moveWorkspacePanelToWindow({
    errorMessage: "Could not move panel",
    manager,
    panel: movedPanel,
    workspacePath: "/organizations/organization/workspaces/workspace",
  });
}

describe("moveWorkspacePanelToWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports an unavailable manager without opening a window", async () => {
    await expect(move()).resolves.toBe(false);

    expect(toastErrorMock).toHaveBeenCalledWith("Could not move panel");
    expect(captureMock).toHaveBeenCalledWith("panel_move_to_window_failed", {
      failure_reason: "manager_unavailable",
    });
    expect(logErrorMock).toHaveBeenCalledWith({
      action: "panel_window.open",
      outcome: "failure",
      panelWindow: {
        failureReason: "manager_unavailable",
        operation: "move",
      },
    });
  });

  it("rejects invalid panel descriptors before opening", async () => {
    const manager = createManager();
    const invalidPanel = {
      ...panel,
      params: { invalid: undefined } as unknown as Panel["params"],
    };

    await expect(move(manager, invalidPanel)).resolves.toBe(false);

    expect(manager.open).not.toHaveBeenCalled();
    expect(captureMock).toHaveBeenCalledWith("panel_move_to_window_failed", {
      failure_reason: "invalid_descriptor",
      platform: "web",
      plugin_id: "plugin",
      renderer: "content",
    });
  });

  it("opens a window and reports success after readiness", async () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("transfer-id")
      .mockReturnValueOnce("token-id")
      .mockReturnValueOnce("window-id");
    let request: PanelWindowOpenRequest | undefined;
    const open = vi.fn((nextRequest: PanelWindowOpenRequest) => {
      request = nextRequest;
      return { close: vi.fn(), ready: Promise.resolve() };
    });

    await expect(move(createManager(open))).resolves.toBe(true);

    expect(request).toMatchObject({
      title: "Document — Lunaris",
      token: "token-id",
      transferId: "transfer-id",
      windowId: "panel-window-id",
    });
    expect(request?.path).toContain("panelWindow=panel-window-id");
    expect(captureMock).toHaveBeenCalledWith("panel_moved_to_window", {
      extension_id: "plugin",
      panel_kind: "resource",
      platform: "web",
      view_id: "content",
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("closes the child and reports readiness failures", async () => {
    const close = vi.fn();
    const open = vi.fn(() => ({
      close,
      ready: Promise.reject(
        new PanelWindowError("open_failed", "Failed to create window")
      ),
    }));

    await expect(move(createManager(open))).resolves.toBe(false);

    expect(close).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("panel_move_to_window_failed", {
      failure_reason: "open_failed",
      extension_id: "plugin",
      panel_kind: "resource",
      platform: "web",
      view_id: "content",
    });
  });

  it("closes the child and reports timeout", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const open = vi.fn(() => ({
      close,
      ready: new Promise<void>(() => undefined),
    }));

    const result = move(createManager(open));
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(result).resolves.toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("panel_move_to_window_failed", {
      failure_reason: "timeout",
      extension_id: "plugin",
      panel_kind: "resource",
      platform: "web",
      view_id: "content",
    });
  });
});

describe("openWorkspacePanelInNewWindow", () => {
  const descriptor: PanelWindowDescriptor = {
    extensionId: "lunaris.kanban",
    params: {
      resourceId: "board-1",
      taskId: "task-1",
      viewId: "plugin-subview:board-1:task:task-1",
    },
    title: "Draft release notes",
    viewId: "task-detail",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens an independent panel window", async () => {
    let request: PanelWindowOpenRequest | undefined;
    const manager = createManager(
      vi.fn((nextRequest: PanelWindowOpenRequest) => {
        request = nextRequest;
        return { close: vi.fn(), ready: Promise.resolve() };
      })
    );

    await expect(
      openWorkspacePanelInNewWindow({
        descriptor,
        errorMessage: "Could not open panel",
        manager,
        workspacePath: "/organization/workspace",
      })
    ).resolves.toBe(true);

    expect(request?.title).toBe("Draft release notes — Lunaris");
    expect(request?.path).toContain("panelDescriptor=");
    expect(captureMock).toHaveBeenCalledWith("panel_opened_in_new_window", {
      extension_id: "lunaris.kanban",
      panel_kind: "resource",
      platform: "web",
      view_id: "task-detail",
    });
  });

  it("reports unsupported and invalid descriptors", async () => {
    await expect(
      openWorkspacePanelInNewWindow({
        descriptor,
        errorMessage: "Could not open panel",
        workspacePath: "/organization/workspace",
      })
    ).resolves.toBe(false);
    expect(captureMock).toHaveBeenCalledWith(
      "panel_open_in_new_window_failed",
      { failure_reason: "manager_unavailable" }
    );

    const manager = createManager();
    await expect(
      openWorkspacePanelInNewWindow({
        descriptor: {
          ...descriptor,
          params: { invalid: undefined },
        } as unknown as PanelWindowDescriptor,
        errorMessage: "Could not open panel",
        manager,
        workspacePath: "/organization/workspace",
      })
    ).resolves.toBe(false);
    expect(manager.open).not.toHaveBeenCalled();
    expect(captureMock).toHaveBeenLastCalledWith(
      "panel_open_in_new_window_failed",
      expect.objectContaining({ failure_reason: "invalid_descriptor" })
    );
  });
});
