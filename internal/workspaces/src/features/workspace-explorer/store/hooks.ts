import { useContext } from "react";
import { WorkspaceExplorerContext, TreeNavigationContext } from "./contexts";

function useWorkspaceExplorer() {
  const context = useContext(WorkspaceExplorerContext);
  if (!context) {
    throw new Error(
      "useWorkspaceExplorer must be used within WorkspaceExplorerProvider"
    );
  }
  return context;
}

export function useWorkspaceResources() {
  return useWorkspaceExplorer().resources;
}

export function useWorkspaceResourcesMap() {
  return useWorkspaceExplorer().resourcesMap;
}

export function useWorkspaceChildrenMap() {
  return useWorkspaceExplorer().childrenMap;
}

export function useWorkspaceTrashMap() {
  return useWorkspaceExplorer().trashMap;
}

export function useWorkspaceActions() {
  return useWorkspaceExplorer().actions;
}

export function useTreeNavigation() {
  const context = useContext(TreeNavigationContext);
  if (!context) {
    throw new Error(
      "useTreeNavigation must be used within WorkspaceExplorerProvider"
    );
  }
  return context;
}

export function useNavigateToResource() {
  return useTreeNavigation().navigateToResource;
}

export function useStartRenamingItem() {
  return useTreeNavigation().startRenamingResource;
}

export function useRegisterTree() {
  return useTreeNavigation().registerTree;
}
