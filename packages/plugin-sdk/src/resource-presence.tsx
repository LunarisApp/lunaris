import { createContext, useContext, type ReactNode } from "react";
import type { JsonValue } from "./json";
import type {
  PluginAwarenessOptions,
  PluginAwarenessStatus,
} from "./awareness";
import { usePluginDataCapabilities } from "./data-adapter";
import { useExtensionId, usePluginPermission } from "./scope";
import type { ResourceStorageHandles } from "./types";

export interface PresenceUser {
  color: string;
  id: string;
  image: string;
  name: string;
}
export interface ResourcePresenceResult {
  participants: readonly PresenceUser[];
  self: PresenceUser | null;
  status: PluginAwarenessStatus;
}
export interface ResourceAwarenessPeer<T> {
  instanceId: string;
  state: T | null;
  user: PresenceUser;
}
export interface ResourceAwarenessResult<T> {
  peers: readonly ResourceAwarenessPeer<T>[];
  setState: (state: T | null) => void;
  status: PluginAwarenessStatus;
}
export interface ResourceViewPresenceScope {
  isVisible: boolean;
  presence: ResourcePresenceResult;
  resourceId: string;
  storage: ResourceStorageHandles;
}
export const UNAVAILABLE_RESOURCE_PRESENCE: ResourcePresenceResult = {
  participants: [],
  self: null,
  status: "unavailable",
};
const Scope = createContext<ResourceViewPresenceScope | null>(null);
/** Host-only boundary. Membership is controlled by the resource view, not consumers. */
export function ResourceViewPresenceProvider({
  value,
  children,
}: {
  value: ResourceViewPresenceScope;
  children?: ReactNode;
}) {
  return <Scope.Provider value={value}>{children}</Scope.Provider>;
}
export function useResourceViewPresenceScope() {
  return useContext(Scope);
}
export function useResourcePresence(): ResourcePresenceResult {
  usePluginPermission("content.read");
  const scope = useContext(Scope);
  const capabilities = usePluginDataCapabilities();
  return (
    capabilities.useResourcePresence?.() ??
    scope?.presence ??
    UNAVAILABLE_RESOURCE_PRESENCE
  );
}
/** T describes application data; validate peer state before interpreting it. */
export function useResourceAwareness<T extends JsonValue>(
  channel: string,
  options?: PluginAwarenessOptions,
): ResourceAwarenessResult<T> {
  usePluginPermission("content.read");
  const extensionId = useExtensionId();
  const capabilities = usePluginDataCapabilities();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(channel))
    throw new Error("Invalid presence channel");
  return (capabilities.useResourceAwareness?.(
    extensionId,
    channel,
    options,
  ) ?? {
    peers: [],
    status: "unavailable",
    setState: () => {},
  }) as unknown as ResourceAwarenessResult<T>;
}
