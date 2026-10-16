import type { DockviewApi } from "dockview";
import {
  type AddPanel,
  type Group,
  MAIN_GROUP_ID,
  type OpenPanelTarget,
  type Panel,
} from "./types";

interface DockviewGroupLike {
  api: {
    setSize: (size: { height?: number; width?: number }) => void;
  };
  height: number;
  id: string;
  width: number;
}

export interface GroupSizeSnapshot {
  height: number;
  width: number;
}

export function findDuplicatePanelForAdd(
  panels: Panel[],
  panel: AddPanel
): Panel | undefined {
  if (panel.allowDuplicate) {
    return;
  }

  const nextViewId = panel.params?.viewId as string | undefined;

  if (nextViewId) {
    return panels.find(
      (existingPanel) => existingPanel.params?.viewId === nextViewId
    );
  }

  return panels.find(
    (existingPanel) =>
      !existingPanel.params?.viewId &&
      existingPanel.pluginId === panel.pluginId &&
      existingPanel.renderer === panel.renderer
  );
}

export function findGroupById(groups: Group[], id: string): Group | undefined {
  return groups.find((group) => group.id === id);
}

export function findViewPanel(
  panels: Panel[],
  viewId: string
): Panel | undefined {
  return panels.find((panel) => panel.params?.viewId === viewId);
}

export function findPanelsByResourceId(
  panels: Panel[],
  resourceId: string
): Panel[] {
  return panels.filter((panel) => panel.params?.resourceId === resourceId);
}

export function findPanelsByViewId(panels: Panel[], viewId: string): Panel[] {
  return panels.filter((panel) => panel.params?.viewId === viewId);
}

export function activateDockviewPanel(
  dockviewApi: DockviewApi | null,
  panelId: string
): boolean {
  const dockviewPanel = dockviewApi?.getPanel(panelId);
  if (!dockviewPanel) {
    return false;
  }
  dockviewPanel.api.setActive();
  return true;
}

export function rememberDockviewGroupSizes(
  snapshot: Map<string, GroupSizeSnapshot>,
  groups: readonly DockviewGroupLike[]
) {
  for (const group of groups) {
    snapshot.set(group.id, { width: group.width, height: group.height });
  }
}

function restoreSnapshotGroupSizes({
  excludedGroupIds,
  groups,
  snapshot,
}: {
  excludedGroupIds: ReadonlySet<string>;
  groups: readonly DockviewGroupLike[];
  snapshot: ReadonlyMap<string, GroupSizeSnapshot>;
}) {
  if (!groups.some((group) => group.id === MAIN_GROUP_ID)) {
    return;
  }

  for (const group of groups) {
    if (excludedGroupIds.has(group.id)) {
      continue;
    }

    const size = snapshot.get(group.id);
    if (!size) {
      continue;
    }

    group.api.setSize({ width: size.width, height: size.height });
  }
}

export function restoreAddedDockviewGroupSizes({
  addedGroupId,
  groups,
  snapshot,
}: {
  addedGroupId: string;
  groups: readonly DockviewGroupLike[];
  snapshot: ReadonlyMap<string, GroupSizeSnapshot>;
}) {
  if (addedGroupId === MAIN_GROUP_ID) {
    const addedGroup = groups.find((group) => group.id === addedGroupId);
    const size = snapshot.get(addedGroupId);
    if (addedGroup && size) {
      addedGroup.api.setSize({ width: size.width, height: size.height });
    }
    return;
  }

  restoreSnapshotGroupSizes({
    groups,
    snapshot,
    excludedGroupIds: new Set([MAIN_GROUP_ID, addedGroupId]),
  });
}

export function restoreNonMainDockviewGroupSizes({
  groups,
  removedGroupId,
  snapshot,
}: {
  groups: readonly DockviewGroupLike[];
  removedGroupId: string;
  snapshot: ReadonlyMap<string, GroupSizeSnapshot>;
}) {
  if (removedGroupId === MAIN_GROUP_ID) {
    return;
  }

  restoreSnapshotGroupSizes({
    groups,
    snapshot,
    excludedGroupIds: new Set([MAIN_GROUP_ID, removedGroupId]),
  });
}

export function resolveOpenPanelPosition(
  groups: Group[],
  target?: OpenPanelTarget
): {
  position: Panel["position"];
  shouldEnsureMainGroup: boolean;
  withinGroupId?: string;
} {
  if (target?.groupId && findGroupById(groups, target.groupId)) {
    const direction = target.direction ?? "within";
    return {
      position: {
        referenceGroup: target.groupId,
        direction,
      },
      shouldEnsureMainGroup: false,
      ...(direction === "within" ? { withinGroupId: target.groupId } : {}),
    };
  }

  if (target?.direction && target.direction !== "within") {
    return {
      position: { direction: target.direction },
      shouldEnsureMainGroup: false,
    };
  }

  return {
    position: { referenceGroup: MAIN_GROUP_ID },
    shouldEnsureMainGroup: !findGroupById(groups, MAIN_GROUP_ID),
    withinGroupId: MAIN_GROUP_ID,
  };
}
