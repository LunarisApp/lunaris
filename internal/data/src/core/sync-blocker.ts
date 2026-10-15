import { createContext, useContext, useSyncExternalStore } from "react";

const MAX_CONSECUTIVE_CLIENT_ERRORS = 3;

export interface SyncBlockState {
  blocked: boolean;
  consecutiveClientErrors: number;
  lastClientErrorStatus: number | null;
}

export interface SyncBlocker {
  getSnapshot: () => SyncBlockState;
  isBlocked: () => boolean;
  recordClientError: (status: number) => void;
  recordNonClientError: () => void;
  recordSuccess: () => void;
  reset: () => void;
  resume: () => void;
  subscribe: (listener: () => void) => () => void;
}

const DEFAULT_STATE: SyncBlockState = {
  blocked: false,
  consecutiveClientErrors: 0,
  lastClientErrorStatus: null,
};

function areStatesEqual(a: SyncBlockState, b: SyncBlockState) {
  return (
    a.blocked === b.blocked &&
    a.consecutiveClientErrors === b.consecutiveClientErrors &&
    a.lastClientErrorStatus === b.lastClientErrorStatus
  );
}

export function createSyncBlocker(): SyncBlocker {
  let state = DEFAULT_STATE;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (next: SyncBlockState) => {
    if (areStatesEqual(state, next)) return;
    state = next;
    emit();
  };

  return {
    getSnapshot: () => state,
    isBlocked: () => state.blocked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recordClientError: (status) => {
      const consecutiveClientErrors = state.consecutiveClientErrors + 1;
      setState({
        blocked: consecutiveClientErrors >= MAX_CONSECUTIVE_CLIENT_ERRORS,
        consecutiveClientErrors,
        lastClientErrorStatus: status,
      });
    },
    recordNonClientError: () => {
      setState({
        ...state,
        consecutiveClientErrors: 0,
        lastClientErrorStatus: null,
      });
    },
    recordSuccess: () => {
      setState({
        ...state,
        consecutiveClientErrors: 0,
        lastClientErrorStatus: null,
      });
    },
    resume: () => setState(DEFAULT_STATE),
    reset: () => setState(DEFAULT_STATE),
  };
}

export const SyncBlockerContext = createContext<SyncBlocker | null>(null);

export function useSyncBlocker(): SyncBlocker {
  const context = useContext(SyncBlockerContext);
  if (!context) {
    throw new Error("useSyncBlocker must be used within a PowerSyncProvider");
  }
  return context;
}

export function useSyncBlockerStateFrom(blocker: SyncBlocker): SyncBlockState {
  return useSyncExternalStore(
    blocker.subscribe,
    blocker.getSnapshot,
    blocker.getSnapshot
  );
}

export function useSyncBlockerState(): SyncBlockState {
  return useSyncBlockerStateFrom(useSyncBlocker());
}
