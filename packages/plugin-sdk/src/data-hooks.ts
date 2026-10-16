import { useCallback, useEffect, useRef, useState } from "react";
import type { Doc as YDoc, Map as YMap } from "yjs";
import { Map as YjsMap } from "yjs";
import type {
  PluginReadyYjsDocument,
  PluginStorageValue,
  PluginYArrayApi,
} from "./data-adapter";
import { usePluginDataCapabilities } from "./data-adapter";
import { useCurrentWorkspace, useCurrentUser } from "./runtime-context";
import { useExtensionId, usePluginPermission } from "./scope";
import type {
  WorkspaceStorageDefinition,
  ResourceStorageHandle,
} from "./types";

export function useYMapField(
  yMap: YMap<string>,
  key: string
): [string, (value: string) => void] {
  const [value, setValue] = useState(() => yMap.get(key) ?? "");
  useEffect(() => {
    const update = () => setValue(yMap.get(key) ?? "");
    yMap.observe(update);
    update();
    return () => yMap.unobserve(update);
  }, [key, yMap]);
  return [
    value,
    useCallback((next: string) => yMap.set(key, next), [key, yMap]),
  ];
}

export function useYMapJson<T>(
  yMap: YMap<string>,
  key: string,
  fallback: T
): [T, (value: T) => void] {
  const fallbackRef = useRef(fallback);
  const read = useCallback(() => {
    const raw = yMap.get(key);
    if (!raw) {
      return fallbackRef.current;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallbackRef.current;
    }
  }, [key, yMap]);
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    yMap.observe(update);
    update();
    return () => yMap.unobserve(update);
  }, [read, yMap]);
  const set = useCallback(
    (next: T) => yMap.set(key, JSON.stringify(next)),
    [key, yMap]
  );
  return [value, set];
}

export function useYArray(
  yDoc: YDoc,
  arrayName: string,
  options?: { deep?: boolean }
): PluginYArrayApi {
  const yArray = yDoc.getArray<YMap<string>>(arrayName);
  const [, setRevision] = useState(0);
  const deep = options?.deep ?? false;
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    if (deep) {
      yArray.observeDeep(update);
      return () => yArray.unobserveDeep(update);
    }
    yArray.observe(update);
    return () => yArray.unobserve(update);
  }, [deep, yArray]);
  return {
    add: useCallback(
      (initial: Record<string, string>) => {
        yDoc.transact(() => {
          const value = new YjsMap<string>();
          yArray.push([value]);
          for (const [key, item] of Object.entries(initial)) {
            value.set(key, item);
          }
        });
      },
      [yArray, yDoc]
    ),
    items: yArray.toArray(),
    remove: useCallback((index: number) => yArray.delete(index, 1), [yArray]),
  };
}

export function useYjsStorage(
  storage: ResourceStorageHandle | undefined,
  workspaceId?: string,
  options?: { enabled?: boolean; userId?: string | null }
): PluginReadyYjsDocument {
  usePluginPermission("content.read");
  usePluginPermission("content.write");
  const currentWorkspace = useCurrentWorkspace();
  const { user, isLoading } = useCurrentUser();
  if (storage && storage.kind !== "yjs") {
    throw new Error("useYjsStorage requires a yjs storage handle");
  }
  const resolvedWorkspaceId = workspaceId ?? currentWorkspace.workspaceId;
  return usePluginDataCapabilities().useReadyYjsStorage(
    storage,
    resolvedWorkspaceId,
    {
      ...options,
      enabled:
        options?.enabled !== false &&
        Boolean(resolvedWorkspaceId) &&
        !isLoading,
      userId: options?.userId ?? user?.id ?? null,
    }
  );
}

export function useKeyValue<T>(
  storage: ResourceStorageHandle,
  key: string
): PluginStorageValue<T> {
  usePluginPermission("content.read");
  usePluginPermission("content.write");
  if (storage.kind !== "key-value") {
    throw new Error("useKeyValue requires a key-value storage handle");
  }
  return usePluginDataCapabilities().useKeyValue<T>(storage.storageId, key);
}

export function useWorkspaceKeyValue<T>(
  definition: WorkspaceStorageDefinition,
  key: string
): PluginStorageValue<T> {
  usePluginPermission("content.read");
  usePluginPermission("content.write");
  return usePluginDataCapabilities().useWorkspaceKeyValue<T>(
    useExtensionId(),
    definition.storageId,
    key
  );
}

export function useYMapTags(
  yMap: YMap<string>,
  key: string
): [string[], (value: string[]) => void] {
  return useYMapJson<string[]>(yMap, key, []);
}

export type { YDoc };
