import { migrateAgentWorkPanel } from "../agent-work/compatibility";
import { createId } from "@repo/utils";
import type { DockviewApi } from "dockview";
import { log, parseError } from "evlog";
import { createStore } from "zustand";
import {
  clampFocusModeWidth,
  closeActiveDockviewPanel,
  exitDockviewFocusMode,
  loadFocusModeWidth,
  persistFocusModeWidth,
  toggleDockviewFocusMode,
} from "./focus-mode";
import { createOpenPanelActions } from "./open-panel-actions";
import { getReferenceGroupId, withUnloadParam } from "./panel-state";
import {
  createPlaceholderRenderer,
  createRendererSlot,
  createRegisteredRenderer,
  getPluginRendererKeys,
  removePluginRendererEntries,
  removeRendererEntry,
  setRendererEntry,
  type GridLayoutRenderer,
  type GridLayoutRenderers,
  type GridLayoutRendererSlot,
} from "./renderer-registry";
import {
  findDuplicatePanelForAdd,
  findGroupById,
  findPanelsByResourceId,
  findPanelsByViewId,
} from "./state-helpers";
import type { GridLayoutState, MovePanelToWindow } from "./store-types";
import { getRendererComponent, type Panel } from "./types";

export type {
  GridLayoutState,
  MovePanelToWindow,
  OpenResourcePanelInput,
  OpenPluginPanelInput,
  OpenRightDockPanelInput,
  OpenToolPanelInput,
} from "./store-types";

// Panel params shape conventions:
//
//   Resource panel:  { viewId: resourceId, resourceId, pluginId }
//   Tool panel:  { viewId: toolId, toolId, pluginId }
//   Chrome:      { }   -- no viewId, not routable (e.g. workspace explorer)
//
// params.viewId is the single source of truth for "what URL slot does this
// panel occupy". Panels without a viewId are non-routable chrome.

export { FOCUS_MODE_WIDTH_MIN } from "./focus-mode";

export const GRID_LAYOUT_LOADED_PANEL_LIMIT = 8;

function getVisiblePanelIds(dockviewApi: DockviewApi | null): Set<string> {
  const ids = new Set<string>();
  const activePanelId = dockviewApi?.activePanel?.id;

  if (activePanelId) {
    ids.add(activePanelId);
  }

  for (const group of dockviewApi?.groups ?? []) {
    const visiblePanelId = group.activePanel?.id;
    if (visiblePanelId) {
      ids.add(visiblePanelId);
    }
  }

  return ids;
}

function applyPanelUnloadLimit(
  panels: Panel[],
  protectedPanelIds: ReadonlySet<string>
): Panel[] {
  const loadedPanels = panels.filter((panel) => !panel.isUnloaded);
  const unloadCount = loadedPanels.length - GRID_LAYOUT_LOADED_PANEL_LIMIT;

  if (unloadCount <= 0) {
    return panels;
  }

  const unloadIds = new Set(
    loadedPanels
      .filter((panel) => !protectedPanelIds.has(panel.id))
      .sort((left, right) => left.lastActiveAt - right.lastActiveAt)
      .slice(0, unloadCount)
      .map((panel) => panel.id)
  );

  if (unloadIds.size === 0) {
    return panels;
  }

  return panels.map((panel) =>
    unloadIds.has(panel.id)
      ? withUnloadParam({ ...panel, isUnloaded: true })
      : panel
  );
}

function isReferenceGroupReady(
  dockviewApi: DockviewApi,
  panel: Panel
): boolean {
  const referenceGroupId = getReferenceGroupId(panel);
  if (!referenceGroupId) {
    return true;
  }
  const getGroup = dockviewApi.getGroup as
    | ((id: string) => unknown)
    | undefined;
  return Boolean(getGroup?.call(dockviewApi, referenceGroupId));
}

function tryAddPanelImmediately(
  panel: Panel,
  state: Pick<GridLayoutState, "componentRenderers" | "dockviewApi">
): void {
  const { dockviewApi } = state;
  const component = getRendererComponent(panel.pluginId, panel.renderer);
  if (
    !dockviewApi ||
    dockviewApi.getPanel(panel.id) ||
    !state.componentRenderers[component] ||
    !isReferenceGroupReady(dockviewApi, panel)
  ) {
    return;
  }

  const {
    isUnloaded: _isUnloaded,
    lastActiveAt: _lastActiveAt,
    pluginId: _pluginId,
    renderer: _renderer,
    size,
    ...dockviewPanel
  } = panel;
  try {
    dockviewApi.addPanel({ component, ...size, ...dockviewPanel });
  } catch (error) {
    log.warn({
      tag: "GridLayout",
      msg: "Immediate panel add deferred to reconciliation",
      error: parseError(error),
    });
  }
}

export type GridLayoutStore = ReturnType<typeof createGridLayoutStore>;

type RendererSlots = Map<string, GridLayoutRendererSlot>;

function setRendererImplementation(
  rendererSlots: RendererSlots,
  component: string,
  renderer: GridLayoutRenderer,
  componentRenderers: GridLayoutRenderers
) {
  let slot = rendererSlots.get(component);
  if (!slot) {
    slot = createRendererSlot();
    rendererSlots.set(component, slot);
  }

  slot.setRenderer(renderer);
  return {
    componentRenderers:
      componentRenderers[component] === slot.Renderer
        ? componentRenderers
        : setRendererEntry(componentRenderers, component, slot.Renderer),
    renderer: slot.Renderer,
  };
}

function removeRendererImplementation(
  rendererSlots: RendererSlots,
  component: string
) {
  rendererSlots.get(component)?.setRenderer(undefined);
  rendererSlots.delete(component);
}

export const createGridLayoutStore = (
  getOnMovePanelToWindow: () => MovePanelToWindow | undefined,
  getViewportWidth: () => number
) => {
  const rendererSlots = new Map<string, GridLayoutRendererSlot>();

  return createStore<GridLayoutState>((set, get) => ({
    activePanelId: null,
    panels: [],
    groups: [],
    componentRenderers: {},
    knownPluginIds: new Set(),
    movingPanelIds: new Set(),
    dockviewApi: null,
    isFocusMode: false,
    enforcePanelUnloadLimit: () => {
      set((state) => ({
        panels: applyPanelUnloadLimit(
          state.panels,
          getVisiblePanelIds(state.dockviewApi)
        ),
      }));
    },
    markPanelActive: (id) => {
      const now = Date.now();
      set((state) => ({
        activePanelId: id,
        panels: applyPanelUnloadLimit(
          state.panels.map((panel) =>
            panel.id === id
              ? withUnloadParam({
                  ...panel,
                  isUnloaded: false,
                  lastActiveAt: now,
                })
              : panel
          ),
          new Set([...getVisiblePanelIds(state.dockviewApi), id])
        ),
      }));
    },
    movePanelToWindow: async (id) => {
      const panel = get().panels.find((entry) => entry.id === id);
      const onMovePanelToWindow = getOnMovePanelToWindow();
      if (!(panel && onMovePanelToWindow) || get().movingPanelIds.has(id)) {
        return;
      }

      set((state) => ({
        movingPanelIds: new Set([...state.movingPanelIds, id]),
      }));
      try {
        if (await onMovePanelToWindow(panel)) {
          get().removePanel(id);
        }
      } finally {
        set((state) => {
          const movingPanelIds = new Set(state.movingPanelIds);
          movingPanelIds.delete(id);
          return { movingPanelIds };
        });
      }
    },
    reloadPanel: (id) => {
      set((state) => ({
        panels: applyPanelUnloadLimit(
          state.panels.map((panel) =>
            panel.id === id
              ? withUnloadParam({ ...panel, isUnloaded: false })
              : panel
          ),
          new Set([...getVisiblePanelIds(state.dockviewApi), id])
        ),
      }));
    },
    resolvePanelRenderer: (id, pluginId, renderer) => {
      const panel = get().panels.find((entry) => entry.id === id);
      if (
        !panel ||
        (panel.pluginId === pluginId && panel.renderer === renderer)
      ) {
        return;
      }

      const currentComponent = getRendererComponent(
        panel.pluginId,
        panel.renderer
      );
      const resolvedComponent = getRendererComponent(pluginId, renderer);
      const resolvedRenderer = get().getOrCreateRenderer(pluginId, renderer);
      if (!resolvedRenderer) {
        return;
      }

      const currentSlot = rendererSlots.get(currentComponent);

      // A live Dockview panel cannot change its component. Keep its original
      // slot as an alias so it follows the resolved renderer and later reloads
      // use the canonical component from state.
      if (currentSlot) {
        currentSlot.setRenderer(resolvedRenderer);
      }

      set((state) => ({
        panels: state.panels.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                params: { ...entry.params, pluginId },
                pluginId,
                renderer,
              }
            : entry
        ),
      }));
      log.debug({
        tag: "GridLayout",
        msg: "Resolved deferred panel renderer",
        id,
        pluginId,
        renderer,
        previousComponent: currentComponent,
        resolvedComponent,
      });
    },
    focusModeWidth: loadFocusModeWidth(),
    renamingResourceId: null,
    setFocusModeWidth: (width) => {
      const clamped = clampFocusModeWidth(width);
      persistFocusModeWidth(clamped);
      set({ focusModeWidth: clamped });
    },
    clearRenamingResource: () => set({ renamingResourceId: null }),
    requestRenameResource: (resourceId) =>
      set({ renamingResourceId: resourceId }),
    closeActivePanel: () => {
      closeActiveDockviewPanel(get().dockviewApi);
    },
    requestRenameActiveResource: () => {
      const { dockviewApi } = get();
      const resourceId = dockviewApi?.activePanel?.params?.resourceId as
        | string
        | undefined;
      if (resourceId) {
        get().requestRenameResource(resourceId);
      }
    },
    setDockviewApi: (api) =>
      set({ activePanelId: api?.activePanel?.id ?? null, dockviewApi: api }),
    toggleFocusMode: () => {
      const { dockviewApi, isFocusMode } = get();
      const nextFocusMode = toggleDockviewFocusMode(dockviewApi, isFocusMode);
      if (nextFocusMode !== null) {
        set({ isFocusMode: nextFocusMode });
      }
    },
    exitFocusMode: () => {
      const { dockviewApi, isFocusMode } = get();
      const nextFocusMode = exitDockviewFocusMode(dockviewApi, isFocusMode);
      if (nextFocusMode !== null) {
        set({ isFocusMode: nextFocusMode });
      }
    },
    setKnownPluginIds: (ids) => set({ knownPluginIds: new Set(ids) }),
    getOrCreateRenderer: (pluginId, renderer) => {
      const { componentRenderers, knownPluginIds } = get();
      const component = getRendererComponent(pluginId, renderer);
      const existingRenderer = componentRenderers[component];

      if (existingRenderer) {
        return existingRenderer;
      }

      // If extension is known but not loaded, register a placeholder
      if (knownPluginIds.has(pluginId)) {
        const placeholderRenderer = createPlaceholderRenderer(pluginId);
        const currentRenderers = get().componentRenderers;
        const update = setRendererImplementation(
          rendererSlots,
          component,
          placeholderRenderer,
          currentRenderers
        );
        if (update.componentRenderers !== currentRenderers) {
          set({ componentRenderers: update.componentRenderers });
        }

        log.debug({
          tag: "GridLayout",
          msg: "Registered placeholder",
          pluginId,
          renderer,
        });

        return update.renderer;
      }
    },
    addPanel: (input) => {
      const panel = migrateAgentWorkPanel(input);
      const { panels } = get();
      const nextViewId = panel.params?.viewId as string | undefined;
      const existingPanel = findDuplicatePanelForAdd(panels, panel);

      if (existingPanel) {
        get().reloadPanel(existingPanel.id);
        if (nextViewId) {
          log.debug({
            tag: "GridLayout",
            msg: "Skipped duplicate panel (viewId)",
            viewId: nextViewId,
          });
        } else {
          log.debug({
            tag: "GridLayout",
            msg: "Skipped duplicate singleton panel",
            pluginId: panel.pluginId,
            renderer: panel.renderer,
          });
        }

        return existingPanel;
      }

      const { allowDuplicate: _allowDuplicate, ...panelDefinition } = panel;
      const newPanel = withUnloadParam({
        id: createId("lp"),
        isUnloaded: false,
        lastActiveAt: Date.now(),
        ...panelDefinition,
      });
      set((state) => ({
        panels: applyPanelUnloadLimit(
          [...state.panels, newPanel],
          getVisiblePanelIds(state.dockviewApi)
        ),
      }));
      tryAddPanelImmediately(newPanel, get());
      log.debug({
        tag: "GridLayout",
        msg: "Added panel",
        id: newPanel.id,
        pluginId: newPanel.pluginId,
        renderer: newPanel.renderer,
      });
      return newPanel;
    },
    removePanel: (id) => {
      set((state) => ({
        activePanelId: state.activePanelId === id ? null : state.activePanelId,
        panels: state.panels.filter((p) => p.id !== id),
      }));
      log.debug({ tag: "GridLayout", msg: "Removed panel", id });
    },
    removePanelsByResourceIds: (resourceIds) => {
      const { panels, dockviewApi } = get();
      const idSet = new Set(resourceIds);
      const panelsToRemove = panels.filter(
        (p) =>
          typeof p.params?.resourceId === "string" &&
          idSet.has(p.params.resourceId as string)
      );

      if (panelsToRemove.length === 0) {
        return;
      }

      if (dockviewApi) {
        for (const panel of panelsToRemove) {
          const dockviewPanel = dockviewApi.getPanel(panel.id);
          dockviewPanel?.api.close();
        }
      }

      set((state) => ({
        panels: state.panels.filter(
          (p) =>
            typeof p.params?.resourceId !== "string" ||
            !idSet.has(p.params.resourceId as string)
        ),
      }));
      log.debug({
        tag: "GridLayout",
        msg: "Removed panels by item IDs",
        count: panelsToRemove.length,
      });
    },
    removePanelsByViewIds: (viewIds) => {
      const { panels, dockviewApi } = get();
      const idSet = new Set(viewIds);
      const panelsToRemove = panels.filter((panel) => {
        const viewId = panel.params?.viewId;
        return typeof viewId === "string" && idSet.has(viewId);
      });

      if (panelsToRemove.length === 0) {
        return;
      }

      if (dockviewApi) {
        for (const panel of panelsToRemove) {
          dockviewApi.getPanel(panel.id)?.api.close();
        }
      }

      set((state) => ({
        panels: state.panels.filter((panel) => {
          const viewId = panel.params?.viewId;
          return typeof viewId !== "string" || !idSet.has(viewId);
        }),
      }));
    },
    updatePanelTitleByResourceId: (resourceId, newTitle) => {
      const { panels, dockviewApi } = get();
      const matchingPanels = findPanelsByResourceId(panels, resourceId);

      if (matchingPanels.length === 0) {
        return;
      }

      set((state) => ({
        panels: state.panels.map((p) =>
          p.params?.resourceId === resourceId ? { ...p, title: newTitle } : p
        ),
      }));

      if (dockviewApi) {
        for (const panel of matchingPanels) {
          dockviewApi.getPanel(panel.id)?.api.setTitle(newTitle);
        }
      }
    },
    updatePanelTitleByViewId: (viewId, newTitle) => {
      const { panels, dockviewApi } = get();
      const matchingPanels = findPanelsByViewId(panels, viewId);

      if (matchingPanels.length === 0) {
        return;
      }

      set((state) => ({
        panels: state.panels.map((panel) =>
          panel.params?.viewId === viewId
            ? { ...panel, title: newTitle }
            : panel
        ),
      }));

      if (dockviewApi) {
        for (const panel of matchingPanels) {
          dockviewApi.getPanel(panel.id)?.api.setTitle(newTitle);
        }
      }
    },
    addGroup: (group) => {
      const { groups } = get();
      const id = group.id ?? createId("lg");

      // Prevent duplicate groups
      const existingGroup = findGroupById(groups, id);
      if (existingGroup) {
        log.debug({ tag: "GridLayout", msg: "Skipped duplicate group", id });
        return existingGroup;
      }

      const newGroup = { ...group, id };
      set((state) => ({ groups: [...state.groups, newGroup] }));
      log.debug({ tag: "GridLayout", msg: "Added group", id: newGroup.id });
      return newGroup;
    },
    removeGroup: (id) => {
      const { dockviewApi, panels } = get();
      const hasPendingPanel = Boolean(
        dockviewApi &&
          panels.some(
            (panel) =>
              getReferenceGroupId(panel) === id &&
              !dockviewApi.getPanel(panel.id)
          )
      );
      if (hasPendingPanel) {
        // Dockview already removed the empty live group. Emit a new groups
        // reference so layout sync recreates it before mounting the pending
        // panel.
        set({ groups: [...get().groups] });
        log.debug({
          tag: "GridLayout",
          msg: "Kept group referenced by pending panel",
          id,
        });
        return;
      }

      set((state) => ({ groups: state.groups.filter((g) => g.id !== id) }));
      log.debug({ tag: "GridLayout", msg: "Removed group", id });
    },
    register: (pluginId, renderer, builder) => {
      const component = getRendererComponent(pluginId, renderer);
      const currentRenderers = get().componentRenderers;
      const update = setRendererImplementation(
        rendererSlots,
        component,
        createRegisteredRenderer(builder),
        currentRenderers
      );
      if (update.componentRenderers !== currentRenderers) {
        set({ componentRenderers: update.componentRenderers });
      }
      log.debug({
        tag: "GridLayout",
        msg: "Registered renderer",
        pluginId,
        renderer,
      });
    },
    unregister: (pluginId, renderer) => {
      const { knownPluginIds, panels } = get();
      const component = getRendererComponent(pluginId, renderer);
      const hasOpenPanel = panels.some((panel) => panel.pluginId === pluginId);

      // Preserve open views even after an extension is uninstalled.
      if (knownPluginIds.has(pluginId) || hasOpenPanel) {
        const placeholderRenderer = createPlaceholderRenderer(pluginId);
        const currentRenderers = get().componentRenderers;
        const update = setRendererImplementation(
          rendererSlots,
          component,
          placeholderRenderer,
          currentRenderers
        );
        if (update.componentRenderers !== currentRenderers) {
          set({ componentRenderers: update.componentRenderers });
        }

        log.debug({
          tag: "GridLayout",
          msg: "Replaced renderer with placeholder",
          pluginId,
          renderer,
        });
      } else {
        removeRendererImplementation(rendererSlots, component);
        set((state) => ({
          componentRenderers: removeRendererEntry(
            state.componentRenderers,
            component
          ),
        }));

        log.debug({
          tag: "GridLayout",
          msg: "Unregistered renderer",
          pluginId,
          renderer,
        });
      }
    },
    unregisterByPlugin: (pluginId) => {
      const { componentRenderers, knownPluginIds, panels } = get();
      const pluginRenderers = getPluginRendererKeys(
        componentRenderers,
        pluginId
      );

      if (pluginRenderers.length === 0) {
        return;
      }

      const hasOpenPanel = panels.some((panel) => panel.pluginId === pluginId);
      if (knownPluginIds.has(pluginId) || hasOpenPanel) {
        const placeholderRenderer = createPlaceholderRenderer(pluginId);

        for (const component of pluginRenderers) {
          rendererSlots.get(component)?.setRenderer(placeholderRenderer);
        }

        log.debug({
          tag: "GridLayout",
          msg: "Replaced all renderers with placeholders",
          pluginId,
          count: pluginRenderers.length,
        });
      } else {
        for (const component of pluginRenderers) {
          removeRendererImplementation(rendererSlots, component);
        }
        set((state) => ({
          componentRenderers: removePluginRendererEntries(
            state.componentRenderers,
            pluginId
          ),
        }));

        log.debug({
          tag: "GridLayout",
          msg: "Unregistered all renderers",
          pluginId,
          count: pluginRenderers.length,
        });
      }
    },
    ...createOpenPanelActions(set, get, getViewportWidth),
  }));
};
