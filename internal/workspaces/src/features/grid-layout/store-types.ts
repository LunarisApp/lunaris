import type { ViewPlacement } from "@lunarisapp/plugin-sdk";
import type { JsonObject } from "@repo/utils";
import type { DockviewApi, IDockviewPanelProps } from "dockview";
import type { ReactNode } from "react";
import type {
  GridLayoutRenderer,
  GridLayoutRenderers,
} from "./renderer-registry";
import type {
  AddGroup,
  AddPanel,
  Group,
  OpenPanelTarget,
  Panel,
} from "./types";

export interface OpenResourcePanelInput {
  extensionId: string;
  parentId?: string | null;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  /** Optional placement, e.g. from drag-drop. Omit for default main-group behavior. */
  target?: OpenPanelTarget;
  title: string;
  viewId: string;
}

export interface OpenToolPanelInput {
  pluginId: string;
  renderer: string;
  target?: OpenPanelTarget;
  title: string;
  toolId: string;
}

export interface OpenRightDockPanelInput {
  extensionId: string;
  params?: JsonObject;
  sourceResourceId?: string;
  title: string;
  viewId: string;
}

export interface OpenPluginPanelInput {
  params?: JsonObject;
  placement?: ViewPlacement;
  pluginId: string;
  renderer: string;
  sourceViewId?: string;
  title: string;
  viewId: string;
}

export type MovePanelToWindow = (panel: Panel) => Promise<boolean>;

export interface GridLayoutState {
  activePanelId: string | null;
  addGroup: (group: AddGroup) => Group;
  addPanel: (panel: AddPanel) => Panel;
  clearRenamingResource: () => void;
  closeActivePanel: () => void;
  componentRenderers: GridLayoutRenderers;
  dockviewApi: DockviewApi | null;
  enforcePanelUnloadLimit: () => void;
  exitFocusMode: () => void;
  focusModeWidth: number;
  /** Check if a component has a renderer, registering placeholder if needed for known extensions */
  getOrCreateRenderer: (
    pluginId: string,
    renderer: string
  ) => GridLayoutRenderer | undefined;
  groups: Group[];
  isFocusMode: boolean;
  /** Set of known extension IDs - used to show placeholder for unloaded extensions */
  knownPluginIds: Set<string>;
  markPanelActive: (id: string) => void;
  movePanelToWindow: (id: string) => Promise<void>;
  movingPanelIds: Set<string>;
  openPluginPanel: (input: OpenPluginPanelInput) => boolean;
  openResourcePanel: (input: OpenResourcePanelInput) => void;
  openRightDockPanel: (input: OpenRightDockPanelInput) => void;
  openToolPanel: (input: OpenToolPanelInput) => void;
  panels: Panel[];
  register: (
    pluginId: string,
    renderer: string,
    builder: (props: IDockviewPanelProps) => ReactNode
  ) => void;
  reloadPanel: (id: string) => void;
  removeGroup: (id: string) => void;
  removePanel: (id: string) => void;
  removePanelsByResourceIds: (resourceIds: string[]) => void;
  removePanelsByViewIds: (viewIds: string[]) => void;
  renamingResourceId: string | null;
  requestRenameActiveResource: () => void;
  requestRenameResource: (resourceId: string) => void;
  resolvePanelRenderer: (
    id: string,
    pluginId: string,
    renderer: string
  ) => void;
  setDockviewApi: (api: DockviewApi | null) => void;
  setFocusModeWidth: (width: number) => void;
  /** Register known extension IDs for placeholder fallback */
  setKnownPluginIds: (ids: string[]) => void;
  toggleFocusMode: () => void;
  /** Unregister a renderer and replace with placeholder if extension is known */
  unregister: (pluginId: string, renderer: string) => void;
  /** Unregister all renderers for an extension and replace with placeholders */
  unregisterByPlugin: (pluginId: string) => void;
  updatePanelTitleByResourceId: (resourceId: string, newTitle: string) => void;
  updatePanelTitleByViewId: (viewId: string, newTitle: string) => void;
}
