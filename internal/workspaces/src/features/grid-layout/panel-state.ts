import { GRID_LAYOUT_UNLOADED_PARAM, type Panel } from "./types";

export function getReferenceGroupId(panel: Panel): string | undefined {
  const referenceGroup =
    panel.position && "referenceGroup" in panel.position
      ? panel.position.referenceGroup
      : undefined;
  return typeof referenceGroup === "string" ? referenceGroup : undefined;
}

export function withUnloadParam(panel: Panel): Panel {
  return {
    ...panel,
    params: {
      ...panel.params,
      [GRID_LAYOUT_UNLOADED_PARAM]: panel.isUnloaded,
    },
  };
}
