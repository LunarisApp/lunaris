/** @vitest-environment happy-dom */

import type {
  GridLayoutState,
  Panel,
  PanelWindowSession,
} from "@repo/workspaces/grid-layout";
import type { PanelWindowManager } from "@repo/platform";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useAcknowledgePanelWindowTransfer,
  usePersistPanelWindowDescriptor,
} from "./workspace-panel-window-lifecycle";

const {
  completePanelWindowTransferMock,
  getPathForActiveDesktopPanelMock,
  jsonObjectsEqualMock,
  logErrorMock,
  logWarnMock,
  panelWindowDescriptorFromPanelMock,
  panelWindowSearchMock,
  persistPanelWindowDescriptorMock,
} = vi.hoisted(() => ({
  completePanelWindowTransferMock: vi.fn(),
  getPathForActiveDesktopPanelMock: vi.fn(
    () => "/organizations/organization/workspaces/workspace/item-1"
  ),
  jsonObjectsEqualMock: vi.fn(() => true),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
  panelWindowDescriptorFromPanelMock: vi.fn(),
  panelWindowSearchMock: vi.fn((windowId) => `?panelWindow=${windowId}`),
  persistPanelWindowDescriptorMock: vi.fn(),
}));

vi.mock("@repo/workspaces/grid-layout", () => ({
  completePanelWindowTransfer: completePanelWindowTransferMock,
  jsonObjectsEqual: jsonObjectsEqualMock,
  panelWindowDescriptorFromPanel: panelWindowDescriptorFromPanelMock,
  panelWindowSearch: panelWindowSearchMock,
  persistPanelWindowDescriptor: persistPanelWindowDescriptorMock,
}));

vi.mock("evlog", () => ({
  log: {
    error: logErrorMock,
    warn: logWarnMock,
  },
  parseError: (error: unknown) => error,
}));

vi.mock("./workspace-desktop-shell-utils", () => ({
  getPathForActiveDesktopPanel: getPathForActiveDesktopPanelMock,
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

const descriptor = {
  extensionId: panel.pluginId,
  params: panel.params,
  title: panel.title,
  viewId: panel.renderer,
};

const session: PanelWindowSession = {
  descriptor,
  transfer: {
    sourceWindowId: "main",
    token: "secret",
    transferId: "transfer-1",
  },
  windowId: "panel-window-1",
};

function createDockviewApi(hasPanel = true) {
  return {
    getPanel: vi.fn(() => (hasPanel ? { id: panel.id } : undefined)),
  } as unknown as GridLayoutState["dockviewApi"];
}

function createManager(acknowledge = vi.fn(async () => undefined)) {
  return {
    acknowledge,
    currentWindowId: "panel-window-1",
    open: vi.fn(),
    platform: "web",
  } satisfies PanelWindowManager;
}

describe("usePersistPanelWindowDescriptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panelWindowDescriptorFromPanelMock.mockReturnValue(descriptor);
  });

  it("persists null and logs when active panel params are invalid", async () => {
    const serializationError = new Error("invalid panel params");
    panelWindowDescriptorFromPanelMock.mockImplementation(() => {
      throw serializationError;
    });

    renderHook(() =>
      usePersistPanelWindowDescriptor({
        activePanelId: panel.id,
        panels: [panel],
        session,
      })
    );

    await waitFor(() => {
      expect(persistPanelWindowDescriptorMock).toHaveBeenCalledWith(
        session,
        null
      );
    });
    expect(logWarnMock).toHaveBeenCalledWith({
      action: "panel_window.descriptor.serialize",
      outcome: "failure",
      error: serializationError,
      panel: {
        pluginId: panel.pluginId,
        renderer: panel.renderer,
      },
    });
  });

  it("contains and logs storage failures", async () => {
    const storageError = new Error("storage unavailable");
    persistPanelWindowDescriptorMock.mockImplementation(() => {
      throw storageError;
    });

    renderHook(() =>
      usePersistPanelWindowDescriptor({
        activePanelId: panel.id,
        panels: [panel],
        session,
      })
    );

    await waitFor(() => {
      expect(logErrorMock).toHaveBeenCalledWith({
        action: "panel_window.descriptor.persist",
        outcome: "failure",
        error: storageError,
      });
    });
  });

  it("persists null after last opened panel closes", async () => {
    const view = renderHook(
      ({ activePanelId, panels }) =>
        usePersistPanelWindowDescriptor({
          activePanelId,
          panels,
          session,
        }),
      {
        initialProps: {
          activePanelId: panel.id as string | null,
          panels: [panel],
        },
      }
    );

    await waitFor(() => {
      expect(persistPanelWindowDescriptorMock).toHaveBeenCalledWith(
        session,
        descriptor
      );
    });
    view.rerender({ activePanelId: null, panels: [] });

    await waitFor(() => {
      expect(persistPanelWindowDescriptorMock).toHaveBeenLastCalledWith(
        session,
        null
      );
    });
  });
});

describe("useAcknowledgePanelWindowTransfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges only after matching panel is rendered", async () => {
    const acknowledge = vi.fn(async () => undefined);
    const manager = createManager(acknowledge);
    const navigate = vi.fn();
    const missingPanelApi = createDockviewApi(false);
    const renderedPanelApi = createDockviewApi(true);
    const view = renderHook(
      ({ dockviewApi, panels }) =>
        useAcknowledgePanelWindowTransfer({
          bootState: "ready",
          dockviewApi,
          navigate,
          panelWindows: manager,
          panels,
          pathname: "/fallback",
          workspaceSlug: "workspace",
          session,
          organizationSlug: "organization",
        }),
      {
        initialProps: {
          dockviewApi: missingPanelApi,
          panels: [panel],
        },
      }
    );

    expect(acknowledge).not.toHaveBeenCalled();
    view.rerender({ dockviewApi: renderedPanelApi, panels: [panel] });

    await waitFor(() => expect(acknowledge).toHaveBeenCalledOnce());
    expect(completePanelWindowTransferMock).toHaveBeenCalledWith(session);
    expect(navigate).toHaveBeenCalledWith(
      {
        pathname: "/organizations/organization/workspaces/workspace/item-1",
        search: "?panelWindow=panel-window-1",
      },
      { replace: true }
    );
  });

  it("retries acknowledgement after a rejected attempt", async () => {
    const acknowledgementError = new Error("source unavailable");
    const acknowledge = vi
      .fn()
      .mockRejectedValueOnce(acknowledgementError)
      .mockResolvedValueOnce(undefined);
    const manager = createManager(acknowledge);
    const navigate = vi.fn();
    const dockviewApi = createDockviewApi();
    const view = renderHook(
      ({ panels }) =>
        useAcknowledgePanelWindowTransfer({
          bootState: "ready",
          dockviewApi,
          navigate,
          panelWindows: manager,
          panels,
          pathname: "/fallback",
          session,
        }),
      { initialProps: { panels: [panel] } }
    );

    await waitFor(() => {
      expect(logErrorMock).toHaveBeenCalledWith({
        action: "panel_window.transfer.acknowledge",
        outcome: "failure",
        error: acknowledgementError,
        panel: {
          extensionId: panel.pluginId,
          viewId: panel.renderer,
        },
      });
    });
    view.rerender({ panels: [{ ...panel }] });

    await waitFor(() => expect(acknowledge).toHaveBeenCalledTimes(2));
    expect(completePanelWindowTransferMock).toHaveBeenCalledWith(session);
    expect(navigate).toHaveBeenCalledWith(
      {
        pathname: "/fallback",
        search: "?panelWindow=panel-window-1",
      },
      { replace: true }
    );
  });
});
