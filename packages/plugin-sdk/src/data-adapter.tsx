import type { ResourcePresenceResult, ResourceAwarenessResult } from "./resource-presence";
import type { JsonValue } from "./json";
import type {
  PluginAwarenessOptions,
  PluginAwarenessResult,
} from "./awareness";
import type { Doc as YDoc } from "yjs";
import { usePluginSdkRuntime } from "./provider";
import type { ResourceStorageHandle } from "./types";

export type PluginYjsPersistenceState = "error" | "idle" | "persisting";

export interface PluginYjsProvider {
  getPersistenceState: () => PluginYjsPersistenceState;
  subscribePersistenceState: (
    listener: (state: PluginYjsPersistenceState) => void
  ) => () => void;
  waitForPersistence: () => Promise<void>;
}

export interface PluginReadyYjsDocument {
  cacheOutcome?: "memory" | "shared" | "sqlite";
  error: Error | null;
  isLoading: boolean;
  yDoc: YDoc | null;
  yProvider: PluginYjsProvider | null;
}

export interface PluginStorageValue<T> {
  isFetching: boolean;
  isLoading: boolean;
  remove: () => Promise<void>;
  set: (value: T) => Promise<void>;
  value: T | null;
}

export interface PluginYArrayApi {
  add: (initial: Record<string, string>) => void;
  items: import("yjs").Map<string>[];
  remove: (index: number) => void;
}

/** Host capabilities required by extension-facing data hooks. */
export interface PluginDataCapabilities {
  useKeyValue: <T>(storageId: string, key: string) => PluginStorageValue<T>;
  useReadyYjsStorage: (
    storage: ResourceStorageHandle | undefined,
    workspaceId: string,
    options?: { enabled?: boolean; userId?: string | null }
  ) => PluginReadyYjsDocument;
  useResourceAwareness?: (extensionId: string, channel: string, options?: PluginAwarenessOptions) => ResourceAwarenessResult<JsonValue>;
  useResourcePresence?: () => ResourcePresenceResult;
  useWorkspaceKeyValue: <T>(
    pluginId: string,
    storageId: string,
    key: string,
  ) => PluginStorageValue<T>;
  useYjsAwareness?: (
    storage: ResourceStorageHandle | undefined,
    workspaceId: string,
    options?: PluginAwarenessOptions,
  ) => PluginAwarenessResult;
}

export function usePluginDataCapabilities(): PluginDataCapabilities {
  return usePluginSdkRuntime().data;
}
