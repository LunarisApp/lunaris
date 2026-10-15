import type { AddGroupOptions, DockviewApi } from "dockview";
import {
  type MutableRefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { GridLayoutState } from "../context";
import { getReferenceGroupId } from "../panel-state";
import {
  type GroupSizeSnapshot,
  rememberDockviewGroupSizes,
  restoreAddedDockviewGroupSizes,
  restoreNonMainDockviewGroupSizes,
} from "../state-helpers";
import { type Group, getRendererComponent, type Panel } from "../types";

/**
 * Transforms our flat Group type into dockview's AddGroupOptions format.
 * Dockview expects min/max in a nested `constraints` object.
 */
function toAddGroupOptions(group: Group): AddGroupOptions {
  const { minimumWidth, maximumWidth, minimumHeight, maximumHeight, ...rest } =
    group;

  const hasConstraints =
    minimumWidth !== undefined ||
    maximumWidth !== undefined ||
    minimumHeight !== undefined ||
    maximumHeight !== undefined;

  return {
    ...rest,
    ...(hasConstraints && {
      constraints: { minimumWidth, maximumWidth, minimumHeight, maximumHeight },
    }),
  } as AddGroupOptions;
}

function haveSameValues(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}

function getAddedValue(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>
): string | undefined {
  for (const value of next) {
    if (!previous.has(value)) return value;
  }

  return;
}

function haveSameRecordValues(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});

  if (leftEntries.length !== rightEntries.length) return false;

  for (const [key, value] of leftEntries) {
    if (right?.[key] !== value) return false;
  }

  return true;
}

interface UseGridLayoutSyncOptions {
  componentRenderers: GridLayoutState["componentRenderers"];
  dockviewRef: MutableRefObject<DockviewApi | null>;
  getOrCreateRenderer: GridLayoutState["getOrCreateRenderer"];
  groups: Group[];
  markPanelActive: GridLayoutState["markPanelActive"];
  panels: Panel[];
  removeGroup: (id: string) => void;
  removePanel: (id: string) => void;
}

/**
 * Handles bidirectional sync between grid-layout state and dockview.
 * - Listens for dockview panel/group removals -> updates state
 * - Watches state changes -> syncs to dockview
 */
export function useGridLayoutSync({
  dockviewRef,
  panels,
  groups,
  componentRenderers,
  getOrCreateRenderer,
  markPanelActive,
  removePanel,
  removeGroup,
}: UseGridLayoutSyncOptions) {
  const groupSizeSnapshotRef = useRef(new Map<string, GroupSizeSnapshot>());
  const groupIdsSnapshotRef = useRef(new Set<string>());
  const managedGroupIdsRef = useRef(new Set<string>());

  // Listen for panel and group removals from the dockview UI.
  useEffect(() => {
    const dockview = dockviewRef.current;
    if (!dockview) {
      return;
    }

    const updateGroupSizeSnapshot = (acceptGroupChange = false) => {
      const groupIds = new Set(dockview.groups.map((group) => group.id));
      if (
        !acceptGroupChange &&
        !haveSameValues(groupIdsSnapshotRef.current, groupIds)
      ) {
        return;
      }

      rememberDockviewGroupSizes(groupSizeSnapshotRef.current, dockview.groups);
      groupIdsSnapshotRef.current = groupIds;
    };

    updateGroupSizeSnapshot(true);
    const panelDisposable = dockview.onDidRemovePanel((panel) =>
      removePanel(panel.id)
    );
    const activePanelDisposable = dockview.onDidActivePanelChange((event) => {
      if (event.panel) {
        markPanelActive(event.panel.id);
      }
    });
    const groupDisposable = dockview.onDidRemoveGroup((group) => {
      removeGroup(group.id);
      restoreNonMainDockviewGroupSizes({
        groups: dockview.groups,
        removedGroupId: group.id,
        snapshot: groupSizeSnapshotRef.current,
      });
      updateGroupSizeSnapshot(true);
    });
    const layoutDisposable = dockview.onDidLayoutChange(() =>
      updateGroupSizeSnapshot()
    );
    const addGroupDisposable = dockview.onDidAddGroup((group) => {
      const groupIds = new Set(dockview.groups.map((entry) => entry.id));
      restoreAddedDockviewGroupSizes({
        groups: dockview.groups,
        addedGroupId: getAddedValue(groupIdsSnapshotRef.current, groupIds) ?? group.id,
        snapshot: groupSizeSnapshotRef.current,
      });
      updateGroupSizeSnapshot(true);
    });

    return () => {
      panelDisposable.dispose();
      activePanelDisposable.dispose();
      groupDisposable.dispose();
      layoutDisposable.dispose();
      addGroupDisposable.dispose();
    };
  }, [dockviewRef, markPanelActive, removePanel, removeGroup]);

  // Watch changes to the groups in state
  useEffect(() => {
    const dockview = dockviewRef.current;
    if (!dockview) {
      return;
    }

    const existing = new Set(dockview.groups.map((g) => g.id));

    for (const group of groups) {
      if (!existing.has(group.id)) {
        dockview.addGroup(toAddGroupOptions(group));
      }
    }

    const nextManagedGroupIds = new Set(groups.map((group) => group.id));
    const previousManagedGroupIds = managedGroupIdsRef.current;
    managedGroupIdsRef.current = nextManagedGroupIds;

    // Splitting or dragging panels creates groups owned by Dockview. Only
    // remove groups explicitly removed from our managed group definitions.
    for (const group of dockview.groups) {
      if (
        previousManagedGroupIds.has(group.id) &&
        !nextManagedGroupIds.has(group.id)
      ) {
        dockview.removeGroup(group);
      }
    }
  }, [dockviewRef, groups]);

  // Add panels after Dockview's passive effect has received the latest
  // component registry. Adding during a layout effect can make Dockview resolve
  // a newly registered component as undefined.
  useEffect(() => {
    const dockview = dockviewRef.current;
    if (!dockview) {
      return;
    }

    const existing = new Set(dockview.panels.map((p) => p.id));

    for (const panel of panels) {
      if (!existing.has(panel.id)) {
        const {
          isUnloaded: _isUnloaded,
          lastActiveAt: _lastActiveAt,
          pluginId,
          renderer,
          size,
          ...rest
        } = panel;
        const component = getRendererComponent(pluginId, renderer);
        // Ensure renderer exists or can be created (placeholder for known extensions)
        const resolvedRenderer = getOrCreateRenderer(pluginId, renderer);
        // Only add panel if renderer is available in current componentRenderers
        // If getOrCreateRenderer just registered a placeholder, componentRenderers
        // will update and this effect will re-run with the new renderer available
        const referenceGroupId = getReferenceGroupId(panel);
        const referenceGroupReady =
          !referenceGroupId || dockview.getGroup(referenceGroupId);
        if (
          resolvedRenderer &&
          componentRenderers[component] &&
          referenceGroupReady
        ) {
          dockview.addPanel({ component, ...size, ...rest });
        }
      }
    }
  }, [dockviewRef, componentRenderers, getOrCreateRenderer, panels]);

  // Reconcile existing panels before passive effects can observe stale state.
  useLayoutEffect(() => {
    const dockview = dockviewRef.current;
    if (!dockview) {
      return;
    }

    for (const panel of panels) {
      const dockviewPanel = dockview.getPanel(panel.id);
      if (
        dockviewPanel &&
        !haveSameRecordValues(dockviewPanel.params, panel.params)
      ) {
        dockviewPanel.update({ params: panel.params ?? {} });
      }
    }

    for (const panel of dockview.panels) {
      if (!panels.find((p: Panel) => p.id === panel.id)) {
        dockview.removePanel(panel);
      }
    }
  }, [dockviewRef, panels]);
}
