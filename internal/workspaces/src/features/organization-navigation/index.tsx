"use client";

import type {
  PluginOrganizationViewRoute,
  ViewPlacement,
} from "@lunarisapp/plugin-sdk";
import type { JsonObject } from "@repo/utils";
import { createContext, type ReactNode, useContext } from "react";
import type { OpenPanelTarget } from "../grid-layout/types";

export {
  getTool,
  isToolId,
  WORKSPACE_SETTINGS_TOOL_ID,
  TOOL_REGISTRY,
  type ToolDescriptor,
  type ToolId,
} from "./tool-registry";

export interface OpenResourceInput {
  /** Internal performance classification for route-driven opens. */
  openKind?: "deep_link";
  parentId?: string | null;
  /** Replace the active view instead of opening another organization tab/history entry. */
  replaceCurrent?: boolean;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  /** Optional placement, e.g. when opening via drag-drop onto a specific group. */
  target?: OpenPanelTarget;
  title: string;
}

export interface OpenToolInput {
  /** Optional desktop Dockview placement. Ignored by mobile routing. */
  target?: OpenPanelTarget;
  toolId: string;
}

export interface OpenViewInput {
  extensionId: string;
  params?: JsonObject;
  placement?: ViewPlacement;
  route?: PluginOrganizationViewRoute;
  sourceResourceId?: string;
  title: string;
  viewId: string;
  /** Optional host instance ID; defaults from the view definition and route. */
  viewInstanceId?: string;
}

export interface OrganizationNavigation {
  clearRenamingResource: () => void;
  closeViewInstances: (viewInstanceIds: string[]) => void;
  /** Open / focus the workspace explorer chrome (desktop: sidebar panel, mobile: main page). */
  openExplorer: () => void;
  openResource: (input: OpenResourceInput) => void;
  /** Opens a normal content item in a separate window. */
  openResourceInNewWindow: (input: OpenResourceInput) => Promise<boolean>;
  openTool: (input: OpenToolInput) => void;
  /** Opens an extension panel or routed subview; false when unsupported. */
  openView: (input: OpenViewInput) => boolean;
  /** Opens an extension panel in a separate window; false when unsupported or blocked. */
  openViewInNewWindow: (input: OpenViewInput) => Promise<boolean>;
  requestRenameActiveResource: () => void;
  setResourceTitle: (resourceId: string, title: string) => void;
  setViewInstanceTitle: (viewInstanceId: string, title: string) => void;
  toggleFocusMode: () => void;
  unregisterPlugin: (pluginId: string) => void;
}

export interface OrganizationViewState {
  /** The active view id (item id or tool id), or null when none is focused. */
  activeViewInstanceId: string | null;
  isExplorerOpen: boolean;
  isFocusMode: boolean;
  isToolOpen: (toolId: string) => boolean;
  renamingResourceId: string | null;
}

const OrganizationNavigationContext =
  createContext<OrganizationNavigation | null>(null);

const OrganizationViewStateContext =
  createContext<OrganizationViewState | null>(null);

interface OrganizationNavigationProviderProps {
  children: ReactNode;
  navigation: OrganizationNavigation;
  viewState: OrganizationViewState;
}

export function OrganizationNavigationProvider({
  children,
  navigation,
  viewState,
}: OrganizationNavigationProviderProps) {
  return (
    <OrganizationNavigationContext.Provider value={navigation}>
      <OrganizationViewStateContext.Provider value={viewState}>
        {children}
      </OrganizationViewStateContext.Provider>
    </OrganizationNavigationContext.Provider>
  );
}

export function useOrganizationNavigation() {
  const context = useContext(OrganizationNavigationContext);
  if (!context) {
    throw new Error(
      "useOrganizationNavigation must be used within OrganizationNavigationProvider"
    );
  }
  return context;
}

export function useOrganizationViewState() {
  const context = useContext(OrganizationViewStateContext);
  if (!context) {
    throw new Error(
      "useOrganizationViewState must be used within OrganizationNavigationProvider"
    );
  }
  return context;
}
