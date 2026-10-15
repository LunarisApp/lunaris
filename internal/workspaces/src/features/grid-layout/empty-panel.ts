import type { AddPanel, Panel } from "./types";

export const EMPTY_PANEL_PLUGIN_ID = "grid-layout";
export const EMPTY_PANEL_RENDERER = "empty-panel";
export const INITIAL_EMPTY_PANEL_PARAM = "__lunarisInitialEmptyPanel";

export interface CreateEmptyPanelDefinitionOptions {
  allowDuplicate?: boolean;
  groupId: string;
  initial?: boolean;
  title: string;
}

export function createEmptyPanelDefinition({
  allowDuplicate,
  groupId,
  initial,
  title,
}: CreateEmptyPanelDefinitionOptions): AddPanel {
  return {
    ...(allowDuplicate ? { allowDuplicate: true } : {}),
    params: initial ? { [INITIAL_EMPTY_PANEL_PARAM]: true } : {},
    pluginId: EMPTY_PANEL_PLUGIN_ID,
    position: { direction: "within", referenceGroup: groupId },
    renderer: EMPTY_PANEL_RENDERER,
    title,
  };
}

export function isEmptyPanel(panel: Panel): boolean {
  return (
    panel.pluginId === EMPTY_PANEL_PLUGIN_ID &&
    panel.renderer === EMPTY_PANEL_RENDERER
  );
}

export function findInitialEmptyPanelId(
  panels: readonly Panel[]
): string | undefined {
  return panels.find(
    (panel) =>
      isEmptyPanel(panel) && panel.params?.[INITIAL_EMPTY_PANEL_PARAM] === true
  )?.id;
}

export function findSingleEmptyPanelId({
  allLivePanelIds,
  groupId,
  livePanelIds,
  panels,
}: {
  allLivePanelIds?: readonly string[];
  groupId: string;
  livePanelIds?: readonly string[];
  panels: readonly Panel[];
}): string | undefined {
  const allLivePanelIdSet =
    allLivePanelIds === undefined ? undefined : new Set(allLivePanelIds);
  const livePanelIdSet =
    livePanelIds === undefined ? undefined : new Set(livePanelIds);
  const matchingPanels = panels.filter((panel) => {
    if (!isEmptyPanel(panel)) return false;
    // Dockview membership wins after render because panels can move groups.
    // State-only panels are pending insertion, so their stored position is valid.
    if (livePanelIdSet?.has(panel.id)) return true;
    if (allLivePanelIdSet?.has(panel.id)) return false;
    if (livePanelIdSet && !allLivePanelIdSet) return false;
    if (!panel.position || !("referenceGroup" in panel.position)) return false;
    if (
      "direction" in panel.position &&
      panel.position.direction &&
      panel.position.direction !== "within"
    ) {
      return false;
    }
    return panel.position.referenceGroup === groupId;
  });

  return matchingPanels.length === 1 ? matchingPanels[0]?.id : undefined;
}
