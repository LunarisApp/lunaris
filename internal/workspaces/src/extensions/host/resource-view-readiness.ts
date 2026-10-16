import { useSyncExternalStore } from "react";

// Readiness belongs to mounted views, not sampled/expiring telemetry attempts.
const readyViews = new Map<string, Set<symbol>>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isResourceViewReady(resourceId: string): boolean {
  return readyViews.has(resourceId);
}

export function markResourceViewReady(resourceId: string, owner: symbol): void {
  const owners = readyViews.get(resourceId) ?? new Set<symbol>();
  if (owners.has(owner)) {
    return;
  }
  owners.add(owner);
  readyViews.set(resourceId, owners);
  notify();
}

export function releaseResourceViewReady(
  resourceId: string,
  owner: symbol
): void {
  const owners = readyViews.get(resourceId);
  if (!owners?.delete(owner)) {
    return;
  }
  if (owners.size === 0) {
    readyViews.delete(resourceId);
  }
  notify();
}

export function useResourceViewReady(resourceId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!resourceId && isResourceViewReady(resourceId),
    () => false
  );
}
