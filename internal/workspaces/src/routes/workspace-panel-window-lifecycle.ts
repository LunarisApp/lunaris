import {
  completePanelWindowTransfer,
  type GridLayoutState,
  jsonObjectsEqual,
  type Panel,
  type PanelWindowSession,
  panelWindowDescriptorFromPanel,
  panelWindowSearch,
  persistPanelWindowDescriptor,
} from "@repo/workspaces/grid-layout";
import type { PanelWindowManager } from "@repo/platform";
import { log, parseError } from "evlog";
import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router";
import { getPathForActiveDesktopPanel } from "./workspace-desktop-shell-utils";
import type { WorkspaceRuntimeBootState } from "./workspace-runtime";

interface PersistPanelWindowDescriptorOptions {
  activePanelId: string | null;
  panels: Panel[];
  session: PanelWindowSession | null;
}

export function usePersistPanelWindowDescriptor({
  activePanelId,
  panels,
  session,
}: PersistPanelWindowDescriptorOptions) {
  const hasOpenedPanelRef = useRef(false);

  useEffect(() => {
    if (!session) return;
    const activePanel = panels.find((panel) => panel.id === activePanelId);
    if (activePanel) hasOpenedPanelRef.current = true;
    if (!activePanel && !hasOpenedPanelRef.current) return;

    let descriptor = null;
    if (activePanel) {
      try {
        descriptor = panelWindowDescriptorFromPanel(activePanel);
      } catch (error) {
        log.warn({
          action: "panel_window.descriptor.serialize",
          outcome: "failure",
          error: parseError(error),
          panel: {
            pluginId: activePanel.pluginId,
            renderer: activePanel.renderer,
          },
        });
      }
    }

    try {
      persistPanelWindowDescriptor(session, descriptor);
    } catch (error) {
      log.error({
        action: "panel_window.descriptor.persist",
        outcome: "failure",
        error: parseError(error),
      });
    }
  }, [activePanelId, panels, session]);
}

interface AcknowledgePanelWindowTransferOptions {
  bootState: WorkspaceRuntimeBootState;
  dockviewApi: GridLayoutState["dockviewApi"];
  navigate: NavigateFunction;
  organizationSlug?: string;
  panels: Panel[];
  panelWindows?: PanelWindowManager;
  pathname: string;
  session: PanelWindowSession | null;
  workspaceSlug?: string;
}

function findTransferredPanel(
  panels: Panel[],
  session: PanelWindowSession
): Panel | undefined {
  const descriptor = session.descriptor;
  if (!descriptor) return;

  return panels.find(
    (panel) =>
      panel.pluginId === descriptor.extensionId &&
      panel.renderer === descriptor.viewId &&
      jsonObjectsEqual(panel.params, descriptor.params)
  );
}

export function useAcknowledgePanelWindowTransfer({
  bootState,
  dockviewApi,
  navigate,
  panelWindows,
  panels,
  pathname,
  workspaceSlug,
  session,
  organizationSlug,
}: AcknowledgePanelWindowTransferOptions) {
  const acknowledgedTransfersRef = useRef(new Set<string>());

  useEffect(() => {
    const transfer = session?.transfer;
    if (
      bootState !== "ready" ||
      !transfer ||
      !session.descriptor ||
      !dockviewApi ||
      !panelWindows ||
      acknowledgedTransfersRef.current.has(transfer.transferId)
    ) {
      return;
    }

    const panel = findTransferredPanel(panels, session);
    if (!panel || !dockviewApi.getPanel(panel.id)) return;

    acknowledgedTransfersRef.current.add(transfer.transferId);
    panelWindows
      .acknowledge({
        sourceWindowId: transfer.sourceWindowId,
        token: transfer.token,
        transferId: transfer.transferId,
      })
      .then(() => {
        completePanelWindowTransfer(session);
        const nextPathname =
          organizationSlug && workspaceSlug
            ? getPathForActiveDesktopPanel(organizationSlug, workspaceSlug, panel)
            : pathname;
        navigate(
          {
            pathname: nextPathname,
            search: panelWindowSearch(session.windowId),
          },
          { replace: true }
        );
      })
      .catch((error) => {
        acknowledgedTransfersRef.current.delete(transfer.transferId);
        log.error({
          action: "panel_window.transfer.acknowledge",
          outcome: "failure",
          error: parseError(error),
          panel: {
            extensionId: session.descriptor?.extensionId,
            viewId: session.descriptor?.viewId,
          },
        });
      });
  }, [
    bootState,
    dockviewApi,
    navigate,
    panelWindows,
    panels,
    pathname,
    workspaceSlug,
    session,
    organizationSlug,
  ]);
}
