import { AGENT_WORK_TOOL_ID } from "../agent-work/constants";
import { log } from "evlog";
import posthog from "posthog-js";
import type { StoreApi } from "zustand";
import { findInitialEmptyPanelId, findSingleEmptyPanelId } from "./empty-panel";
import { getReferenceGroupId, withUnloadParam } from "./panel-state";
import {
  activateDockviewPanel,
  findGroupById,
  findViewPanel,
  resolveOpenPanelPosition,
} from "./state-helpers";
import type { GridLayoutState } from "./store-types";
import { MAIN_GROUP_ID, RIGHT_GROUP_ID } from "./types";

type OpenPanelActions = Pick<
  GridLayoutState,
  | "openResourcePanel"
  | "openPluginPanel"
  | "openRightDockPanel"
  | "openToolPanel"
>;

type GetGridLayoutState = StoreApi<GridLayoutState>["getState"];
type SetGridLayoutState = StoreApi<GridLayoutState>["setState"];

function findEmptyPanelIdToReplace({
  dockviewApi,
  groupId,
  panels,
}: Pick<GridLayoutState, "dockviewApi" | "panels"> & {
  groupId?: string;
}): string | undefined {
  if (groupId !== MAIN_GROUP_ID) {
    return undefined;
  }

  const initialEmptyPanelId = findInitialEmptyPanelId(panels);
  if (initialEmptyPanelId) {
    return initialEmptyPanelId;
  }

  const liveGroup =
    typeof dockviewApi?.getGroup === "function"
      ? dockviewApi.getGroup(groupId)
      : undefined;

  return findSingleEmptyPanelId({
    allLivePanelIds: dockviewApi?.panels?.map((panel) => panel.id),
    groupId,
    livePanelIds: liveGroup?.panels.map((panel) => panel.id),
    panels,
  });
}

export function createOpenPanelActions(
  set: SetGridLayoutState,
  get: GetGridLayoutState,
  getViewportWidth: () => number
): OpenPanelActions {
  return {
    openResourcePanel: ({
      resourceId,
      resourceTypeId,
      parentId,
      extensionId,
      viewId,
      schemaVersion,
      title,
      target,
    }) => {
      const { panels, groups, dockviewApi, addPanel, addGroup } = get();
      const existingPanel = findViewPanel(panels, resourceId);

      if (existingPanel) {
        // A renderer mismatch means the resource definition changed while open.
        // Reusing the existing DOM would show stale UI.
        if (
          existingPanel.pluginId !== extensionId ||
          existingPanel.renderer !== viewId
        ) {
          log.warn({
            tag: "GridLayout",
            msg: "Refusing to reuse resource panel with mismatched renderer",
            resourceId,
            existingPluginId: existingPanel.pluginId,
            existingRenderer: existingPanel.renderer,
            requestedExtensionId: extensionId,
            requestedViewId: viewId,
          });
          return;
        }
        const isActive = dockviewApi?.activePanel?.id === existingPanel.id;
        if (!isActive && activateDockviewPanel(dockviewApi, existingPanel.id)) {
          log.debug({
            tag: "GridLayout",
            msg: "Focused existing resource panel",
            id: existingPanel.id,
            resourceId,
          });
        }
        if (existingPanel.isUnloaded) {
          get().reloadPanel(existingPanel.id);
        }
        return;
      }

      const { position, shouldEnsureMainGroup, withinGroupId } =
        resolveOpenPanelPosition(groups, target);
      const emptyPanelId = findEmptyPanelIdToReplace({
        dockviewApi,
        groupId: withinGroupId,
        panels,
      });

      if (shouldEnsureMainGroup) {
        addGroup({ id: MAIN_GROUP_ID, direction: "right" });
      }

      addPanel({
        pluginId: extensionId,
        renderer: viewId,
        title,
        params: {
          viewId: resourceId,
          resourceId,
          parentId: parentId ?? null,
          pluginId: extensionId,
          resourceTypeId,
          schemaVersion,
        },
        position,
      });
      if (emptyPanelId) {
        get().removePanel(emptyPanelId);
      }
      log.debug({
        tag: "GridLayout",
        msg: "Opened resource panel",
        resourceId,
        extensionId,
        viewId,
      });
      posthog.capture("resource_opened", { resource_type_id: resourceTypeId });
    },
    openPluginPanel: ({
      params,
      placement,
      pluginId,
      renderer,
      sourceViewId,
      title,
      viewId,
    }) => {
      const { panels, groups, dockviewApi, addGroup, addPanel } = get();
      if (placement === "secondary") {
        const activeResourceId = panels.find(
          (panel) => panel.id === get().activePanelId
        )?.params?.viewId;
        get().openRightDockPanel({
          extensionId: pluginId,
          params,
          sourceResourceId:
            sourceViewId ??
            (typeof activeResourceId === "string"
              ? activeResourceId
              : undefined),
          title,
          viewId: renderer,
        });
        return true;
      }

      const existingPanel = findViewPanel(panels, viewId);
      const nextParams = {
        ...existingPanel?.params,
        ...params,
        pluginId,
        viewId,
      };

      if (existingPanel) {
        if (
          existingPanel.pluginId !== pluginId ||
          existingPanel.renderer !== renderer
        ) {
          log.warn({
            tag: "GridLayout",
            msg: "Refusing to reuse extension panel with mismatched renderer",
            viewId,
            existingPluginId: existingPanel.pluginId,
            existingRenderer: existingPanel.renderer,
            requestedPluginId: pluginId,
            requestedRenderer: renderer,
          });
          return false;
        }

        set((state) => ({
          panels: state.panels.map((panel) =>
            panel.id === existingPanel.id
              ? withUnloadParam({ ...panel, params: nextParams, title })
              : panel
          ),
        }));
        const dockviewPanel = dockviewApi?.getPanel(existingPanel.id);
        dockviewPanel?.update({ params: nextParams });
        dockviewPanel?.api.setTitle(title);
        activateDockviewPanel(dockviewApi, existingPanel.id);
        get().reloadPanel(existingPanel.id);
        return true;
      }

      if (!findGroupById(groups, MAIN_GROUP_ID)) {
        addGroup({ id: MAIN_GROUP_ID, direction: "right" });
      }

      const sourcePanel = sourceViewId
        ? findViewPanel(panels, sourceViewId)
        : undefined;
      const sourceGroupId = sourcePanel
        ? (dockviewApi?.getPanel(sourcePanel.id)?.group.id ??
          getReferenceGroupId(sourcePanel))
        : undefined;
      const targetGroupId = sourceGroupId ?? MAIN_GROUP_ID;
      const emptyPanelId = findEmptyPanelIdToReplace({
        dockviewApi,
        groupId: targetGroupId,
        panels,
      });

      addPanel({
        params: nextParams,
        pluginId,
        position: { referenceGroup: targetGroupId },
        renderer,
        title,
      });
      if (emptyPanelId) {
        get().removePanel(emptyPanelId);
      }
      log.debug({
        tag: "GridLayout",
        msg: "Opened extension panel",
        pluginId,
        renderer,
        sourceViewId,
        viewId,
      });
      return true;
    },
    openRightDockPanel: ({
      extensionId,
      viewId,
      title,
      params,
      sourceResourceId,
    }) => {
      const { panels, groups, dockviewApi, addGroup, addPanel } = get();
      const sourcePanel = sourceResourceId
        ? findViewPanel(panels, sourceResourceId)
        : undefined;
      const nextParams = {
        ...params,
        routeViewId: sourceResourceId ?? null,
      };
      const existingPanel = panels.find(
        (panel) =>
          !panel.params?.viewId &&
          panel.pluginId === extensionId &&
          panel.renderer === viewId
      );

      if (!findGroupById(groups, MAIN_GROUP_ID)) {
        addGroup({ id: MAIN_GROUP_ID, direction: "right" });
      }

      if (!findGroupById(groups, RIGHT_GROUP_ID)) {
        addGroup({
          id: RIGHT_GROUP_ID,
          referenceGroup: MAIN_GROUP_ID,
          direction: "right",
          initialWidth: Math.max(getViewportWidth() * 0.28, 320),
          minimumWidth: 320,
        });
      }

      if (existingPanel) {
        get().reloadPanel(existingPanel.id);
        set((state) => ({
          panels: state.panels.map((panel) =>
            panel.id === existingPanel.id
              ? withUnloadParam({ ...panel, title, params: nextParams })
              : panel
          ),
        }));
        const updatedPanel = get().panels.find(
          (panel) => panel.id === existingPanel.id
        );
        const dockviewPanel = dockviewApi?.getPanel(existingPanel.id);
        dockviewPanel?.update({ params: updatedPanel?.params ?? nextParams });
        dockviewPanel?.api.setTitle(title);

        if (sourcePanel) {
          setTimeout(() => {
            activateDockviewPanel(get().dockviewApi, sourcePanel.id);
          }, 0);
        }
        return;
      }

      addPanel({
        pluginId: extensionId,
        renderer: viewId,
        title,
        params: nextParams,
        position: { referenceGroup: RIGHT_GROUP_ID },
        size: {
          initialWidth: Math.max(getViewportWidth() * 0.28, 320),
          minimumWidth: 320,
        },
      });

      if (sourcePanel) {
        setTimeout(() => {
          activateDockviewPanel(get().dockviewApi, sourcePanel.id);
        }, 0);
      }
      log.debug({
        tag: "GridLayout",
        msg: "Opened right dock panel",
        extensionId,
        sourceResourceId,
        viewId,
      });
    },
    openToolPanel: ({ toolId, pluginId, renderer, target, title }) => {
      const { panels, groups, dockviewApi, addPanel, addGroup } = get();
      const existingPanel = findViewPanel(panels, toolId);

      if (existingPanel) {
        if (activateDockviewPanel(dockviewApi, existingPanel.id)) {
          log.debug({
            tag: "GridLayout",
            msg: "Focused existing tool panel",
            id: existingPanel.id,
            toolId,
          });
        }
        get().reloadPanel(existingPanel.id);
        return;
      }

      const { position, shouldEnsureMainGroup, withinGroupId } =
        resolveOpenPanelPosition(groups, target);
      const emptyPanelId = findEmptyPanelIdToReplace({
        dockviewApi,
        groupId: withinGroupId,
        panels,
      });

      if (shouldEnsureMainGroup) {
        addGroup({ id: MAIN_GROUP_ID, direction: "right" });
      }

      addPanel({
        pluginId,
        renderer,
        title,
        params: { viewId: toolId, toolId, pluginId },
        position,
        ...(toolId === AGENT_WORK_TOOL_ID && position?.direction === "right"
          ? {
              // Two-thirds of the default three-column layout's equal share.
              size: {
                initialWidth: Math.round(
                  ((dockviewApi?.width || getViewportWidth()) * 2) / 9
                ),
              },
            }
          : {}),
      });
      if (emptyPanelId) {
        get().removePanel(emptyPanelId);
      }
      log.debug({
        tag: "GridLayout",
        msg: "Opened tool panel",
        toolId,
        pluginId,
        renderer,
      });
      posthog.capture("tool_panel_opened", { tool_id: toolId });
    },
  };
}
