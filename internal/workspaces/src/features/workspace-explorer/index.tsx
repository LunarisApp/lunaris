"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useCurrentWorkspace } from "../workspace";
import { WorkspaceExplorerTree } from "./components/workspace-tree";
import { WorkspaceExplorerProvider } from "./store";

type WorkspaceExplorerProps = HTMLAttributes<HTMLDivElement>;

/**
 * Container component that provides workspace explorer context.
 * Wrap this around any components that need access to the explorer.
 */
export function WorkspaceExplorerContainer({
  children,
}: {
  children: ReactNode;
}) {
  const { workspaceId } = useCurrentWorkspace();

  return (
    <WorkspaceExplorerProvider
      workspaceId={workspaceId}
      // WorkspaceProvider already waits for workspace_index before mounting shell.
      // Avoid a second wait on an equivalent stream subscription here.
      waitForSync={false}
    >
      {children}
    </WorkspaceExplorerProvider>
  );
}

/**
 * Combined component. Includes its own provider.
 */
export function WorkspaceExplorer({
  className,
  ...props
}: WorkspaceExplorerProps) {
  return (
    <WorkspaceExplorerContainer>
      <WorkspaceExplorerTree className={className} {...props} />
    </WorkspaceExplorerContainer>
  );
}

export { WorkspaceExplorerButton } from "./components/workspace-explorer-button";
export { WorkspaceTrashButton } from "./components/workspace-trash-button";
export { WorkspaceTrashPanel } from "./components/workspace-trash-panel";
export { WorkspaceExplorerTree } from "./components/workspace-tree";
export { WorkspaceTreeSkeleton } from "./components/workspace-tree-skeleton";
export {
  WORKSPACE_EXPLORER_PLUGIN_ID,
  WORKSPACE_EXPLORER_RENDERER,
  WORKSPACE_TRASH_PLUGIN_ID,
  WORKSPACE_TRASH_RENDERER,
  WORKSPACE_TRASH_TOOL_ID,
  VIRTUAL_ROOT_ID,
} from "./constants";
export { useAvailableResources } from "./hooks/use-available-resources";
export { useResourceBreadcrumb } from "./hooks/use-resource-breadcrumb";
export type {
  WorkspaceExplorerActions,
  WorkspaceExplorerContextValue,
} from "./store";
export {
  WorkspaceExplorerProvider,
  useNavigateToResource,
  useWorkspaceActions,
  useWorkspaceChildrenMap,
  useWorkspaceResources,
  useWorkspaceResourcesMap,
  useWorkspaceTrashMap,
  useStartRenamingItem,
} from "./store";
export type {
  ChildrenMap,
  WorkspaceResourceEntity,
  WorkspaceResourcesMap,
  WorkspaceResourceTrashMap,
} from "./types";
export { isFolder, parseResourceIcon, resolveWorkspaceResourceIcon } from "./types";
export { getAncestorPath } from "./utils";
