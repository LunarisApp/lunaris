import type { ResourceStorageHandle, ResourceStorageHandles } from "./types";

export interface PluginResourceData {
  createdAt: string | null;
  name: string | null;
  parentId: string | null;
  position: number | null;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  storage: ResourceStorageHandles;
  updatedAt: string | null;
}

export type PluginResourceResolution =
  | { status: "ready" }
  | {
      diagnostic: string;
      retryable: boolean;
      status: "quarantined";
    };

/** Permission-scoped workspace resource reader. */
export interface PluginResourceReadContext {
  getWorkspaceResource(resourceId: string): Promise<PluginResourceData | null>;
  getWorkspaceResourceChildren(parentId: string): Promise<PluginResourceData[]>;
  getYjsStorageUpdates(
    storage: ResourceStorageHandle
  ): Promise<Array<{ updateBase64: string }>>;
  resolveResource(resourceId: string): Promise<PluginResourceResolution>;
}
