import type { Awareness } from "y-protocols/awareness";
import { usePluginDataCapabilities } from "./data-adapter";
import { useCurrentWorkspace } from "./runtime-context";
import { usePluginPermission } from "./scope";
import type { ResourceStorageHandle } from "./types";

export type PluginAwarenessStatus =
  | "unavailable"
  | "connecting"
  | "connected"
  | "error";
export interface PluginAwarenessResult {
  awareness: Awareness | null;
  status: PluginAwarenessStatus;
}
export interface PluginAwarenessOptions {
  enabled?: boolean;
}
export const UNAVAILABLE_AWARENESS: PluginAwarenessResult = {
  awareness: null,
  status: "unavailable",
};

/** Ephemeral presence lease. Only call from a visible resource view, never a data reader. */
export function useYjsAwareness(
  storage: ResourceStorageHandle | undefined,
  options?: PluginAwarenessOptions
): PluginAwarenessResult {
  usePluginPermission("content.read");
  const capabilities = usePluginDataCapabilities();
  const { workspaceId } = useCurrentWorkspace();
  if (storage && storage.kind !== "yjs") {
    throw new Error("useYjsAwareness requires Yjs storage");
  }
  return (
    capabilities.useYjsAwareness?.(storage, workspaceId, options) ??
    UNAVAILABLE_AWARENESS
  );
}
