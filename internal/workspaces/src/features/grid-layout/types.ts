import type { JsonObject } from "@repo/utils";
import type { AddGroupOptions, AddPanelPositionOptions } from "dockview";

export type { JsonObject, JsonPrimitive, JsonValue } from "@repo/utils";

interface PanelSize {
  initialHeight?: number;
  initialWidth?: number;
  maximumHeight?: number;
  maximumWidth?: number;
  minimumHeight?: number;
  minimumWidth?: number;
}

export interface Panel {
  id: string;
  isUnloaded: boolean;
  lastActiveAt: number;
  params?: JsonObject;
  pluginId: string;
  position?: AddPanelPositionOptions;
  renderer: string;
  size?: PanelSize;
  title: string;
}
export type AddPanel = Omit<Panel, "id" | "isUnloaded" | "lastActiveAt"> & {
  /** Skip chrome-panel singleton deduplication for intentionally repeatable panels. */
  allowDuplicate?: boolean;
};

interface GroupSize {
  initialHeight?: number;
  initialWidth?: number;
  maximumHeight?: number;
  maximumWidth?: number;
  minimumHeight?: number;
  minimumWidth?: number;
}

export type Group = Partial<AddGroupOptions> & GroupSize & { id: string };
export type AddGroup = Partial<AddGroupOptions> & GroupSize;

export const LEFT_GROUP_ID = "left";
export const MAIN_GROUP_ID = "main";
export const RIGHT_GROUP_ID = "right-dock";
export const GRID_LAYOUT_UNLOADED_PARAM = "__lunarisIsUnloaded";

export interface OpenPanelTarget {
  /** Placement relative to the target group (or organization edge when no groupId). */
  direction?: "left" | "right" | "above" | "below" | "within";
  /** Target group id. Undefined = edge split or default main group. */
  groupId?: string;
}

export function getRendererComponent(pluginId: string, renderer: string) {
  return `${pluginId}.${renderer}`;
}
