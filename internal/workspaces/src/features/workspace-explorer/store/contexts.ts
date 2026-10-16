import type {
  ResourceCreateResult,
  ResourceInitializeContext,
  ResourceTypeDefinition,
} from "@lunarisapp/plugin-sdk";
import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { createContext } from "react";
import type {
  ChildrenMap,
  WorkspaceResourcesMap,
  WorkspaceResourceTrashMap,
} from "../types";

export interface WorkspaceExplorerActions {
  createFolder: (parentId: string) => Promise<string>;
  createResource: (
    parentId: string,
    resourceType: ResourceTypeDefinition,
    name?: string,
    initialPayload?: ResourceInitializeContext["initialPayload"]
  ) => Promise<ResourceCreateResult | null>;
  deleteResource: (resourceId: string) => Promise<void>;
  deleteResources: (resourceIds: string[]) => Promise<void>;
  duplicateResource: (
    resourceId: string,
    options: {
      copyLabel: string;
      trigger: "clipboard" | "context-menu";
      untitledLabel: string;
    }
  ) => Promise<void>;
  moveResource: (
    resourceId: string,
    newParentId: string,
    newPosition: number
  ) => Promise<void>;
  purgeResources: (resourceIds: string[]) => Promise<void>;
  renameResource: (resourceId: string, newName: string) => Promise<void>;
  reorderChildren: (parentId: string, orderedIds: string[]) => Promise<void>;
  restoreResources: (resourceIds: string[]) => Promise<void>;
  touchResource: (resourceId: string) => Promise<void>;
}

export interface WorkspaceExplorerContextValue {
  actions: WorkspaceExplorerActions;
  childrenMap: ChildrenMap;
  resources: WorkspaceResourceEntity[];
  resourcesMap: WorkspaceResourcesMap;
  trashMap: WorkspaceResourceTrashMap;
}

export interface TreeNavigationContextValue {
  navigateToResource: (resourceId: string) => void;
  registerTree: (
    tree: TreeInstance<WorkspaceResourceEntity>,
    onOpenResource?: (resource: WorkspaceResourceEntity) => void
  ) => void;
  startRenamingResource: (resourceId: string) => void;
}

export const WorkspaceExplorerContext =
  createContext<WorkspaceExplorerContextValue | null>(null);

export const TreeNavigationContext =
  createContext<TreeNavigationContextValue | null>(null);
