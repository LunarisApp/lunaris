import { useSyncAccess, useSyncStream } from "@repo/data/core";
import { useEffect, useRef, useState } from "react";

// Window covering the React-batch gap between PowerSync `statusChanged`
// (`hasSynced` flips true) and the watched query's async re-fetch flushing
// rows. Without this delay an initial cold load briefly renders
// `data === [] && hasSynced === true` between the two updates, causing the
// empty-state placeholder to flash before content appears.
const POST_SETTLE_GRACE_MS = 150;

export interface StableLoadingState {
  /** Render the empty placeholder (sync settled + data confirmed empty). */
  showEmpty: boolean;
  /** Render the skeleton placeholder (initial load not yet confirmed). */
  showSkeleton: boolean;
}

/**
 * Stable loading-state derivation for PowerSync-backed lists.
 *
 * Absorbs the race where workspace stream readiness flips one render before the
 * watched `useSuspenseQuery` flushes its rows. Latches into the "ready" state
 * the first time data is observed non-empty, so a later push returning `[]`
 * does not regress to a skeleton.
 *
 * - Cold cache + has data → data lands → instant content (no grace wait).
 * - Cold cache + truly empty → grace expires after settle → empty placeholder.
 * - Warm cache → ready from the first render.
 */
export function useStableInitialLoading(opts: {
  dataEmpty: boolean;
  /** Optional upstream prerequisite (e.g. `organizationId === undefined`). */
  extraGate?: boolean;
}): StableLoadingState {
  const { dataEmpty, extraGate = false } = opts;
  const workspaceIndex = useSyncStream({ name: "workspace_index" });
  const syncAccess = useSyncAccess();
  const hasInitialSync = workspaceIndex?.subscription.hasSynced === true;
  const rawSettled =
    !extraGate && (syncAccess === "local-only" || hasInitialSync);

  // Latch: once data has been observed, never regress to skeleton.
  const seenDataRef = useRef(false);
  if (!dataEmpty) {
    seenDataRef.current = true;
  }

  // Delay propagating `rawSettled` to absorb the post-status flush race.
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (!rawSettled) {
      setGraceElapsed(false);
      return;
    }
    const timer = setTimeout(() => setGraceElapsed(true), POST_SETTLE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [rawSettled]);

  if (seenDataRef.current) {
    return { showSkeleton: false, showEmpty: false };
  }
  if (!(rawSettled && graceElapsed)) {
    return { showSkeleton: true, showEmpty: false };
  }
  return { showSkeleton: false, showEmpty: dataEmpty };
}
