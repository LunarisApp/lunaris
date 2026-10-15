import { WASQLiteVFS } from "@powersync/web";

export interface PowerSyncRuntimeMode {
  enableMultiTabs: boolean;
  fallbackVfs?: WASQLiteVFS;
  modeLabel: "idb-no-worker" | "idb-worker" | "opfs-worker";
  preferredVfs: WASQLiteVFS;
  useWebWorker: boolean;
}

function supportsPowerSyncMultiTabs() {
  if (typeof SharedWorker === "undefined") return false;
  if (typeof navigator === "undefined") return false;
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent;
  return !(
    /(Android|iPhone|iPod|iPad)/i.test(userAgent) || "safari" in window
  );
}

export function resolveRuntimeFlags(): PowerSyncRuntimeMode {
  const useWebWorker = typeof Worker !== "undefined";
  const enableMultiTabs = supportsPowerSyncMultiTabs();

  if (!useWebWorker) {
    return {
      useWebWorker,
      enableMultiTabs,
      preferredVfs: WASQLiteVFS.IDBBatchAtomicVFS,
      modeLabel: "idb-no-worker",
    };
  }

  return {
    useWebWorker,
    enableMultiTabs,
    preferredVfs: WASQLiteVFS.OPFSCoopSyncVFS,
    fallbackVfs: WASQLiteVFS.IDBBatchAtomicVFS,
    modeLabel: "opfs-worker",
  };
}

export function getFallbackRuntimeMode(
  runtimeMode: PowerSyncRuntimeMode
): PowerSyncRuntimeMode | null {
  if (
    !runtimeMode.fallbackVfs ||
    runtimeMode.preferredVfs === runtimeMode.fallbackVfs
  ) {
    return null;
  }

  return {
    ...runtimeMode,
    preferredVfs: runtimeMode.fallbackVfs,
    fallbackVfs: undefined,
    modeLabel: runtimeMode.useWebWorker ? "idb-worker" : "idb-no-worker",
  };
}
