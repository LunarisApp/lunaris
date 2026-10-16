import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SyncStatus = { hasSynced: boolean };
type SyncAccess = "local-only" | "cloud";

const syncStatus: SyncStatus = { hasSynced: false };
let syncAccess: SyncAccess = "cloud";
let workspaceIndexHasSynced = false;

vi.mock("@repo/data/core", () => ({
  useSyncAccess: () => syncAccess,
  useSyncStream: () => ({
    subscription: { hasSynced: workspaceIndexHasSynced },
  }),
}));

vi.mock("@repo/data/features/sync-status", () => ({
  useStatus: () => syncStatus,
}));

import { useStableInitialLoading } from "./use-stable-initial-loading";

const GRACE_MS = 150;

describe("useStableInitialLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncStatus.hasSynced = false;
    workspaceIndexHasSynced = false;
    syncAccess = "cloud";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows skeleton on cold cache while sync is in flight", () => {
    const { result } = renderHook(() =>
      useStableInitialLoading({ dataEmpty: true })
    );
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });
  });

  it("does not settle workspace reads when only global sync is ready", () => {
    syncStatus.hasSynced = true;
    const { result } = renderHook(() =>
      useStableInitialLoading({ dataEmpty: true })
    );
    act(() => {
      vi.advanceTimersByTime(GRACE_MS * 2);
    });
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });
  });

  it("renders content immediately when data is present at mount (warm cache)", () => {
    const { result } = renderHook(() =>
      useStableInitialLoading({ dataEmpty: false })
    );
    expect(result.current).toEqual({ showSkeleton: false, showEmpty: false });
  });

  it("latches on first non-empty observation and never regresses to skeleton", () => {
    const { result, rerender } = renderHook(
      ({ empty }) => useStableInitialLoading({ dataEmpty: empty }),
      { initialProps: { empty: true } }
    );
    expect(result.current.showSkeleton).toBe(true);

    rerender({ empty: false });
    expect(result.current).toEqual({ showSkeleton: false, showEmpty: false });

    // A later PowerSync push returning [] must not regress to skeleton or empty.
    rerender({ empty: true });
    expect(result.current).toEqual({ showSkeleton: false, showEmpty: false });
  });

  it("holds skeleton through the post-settle grace window before showing empty", () => {
    workspaceIndexHasSynced = true;
    const { result } = renderHook(() =>
      useStableInitialLoading({ dataEmpty: true })
    );

    // Grace still pending: still skeleton, NOT empty (this is the bug fix).
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    expect(result.current).toEqual({ showSkeleton: false, showEmpty: true });
  });

  it("settles from the workspace index when global native status is unavailable", () => {
    workspaceIndexHasSynced = true;
    const { result } = renderHook(() =>
      useStableInitialLoading({ dataEmpty: true })
    );

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    expect(result.current).toEqual({ showSkeleton: false, showEmpty: true });
  });

  it("does not flash empty when data lands during the grace window", () => {
    workspaceIndexHasSynced = true;
    const { result, rerender } = renderHook(
      ({ empty }) => useStableInitialLoading({ dataEmpty: empty }),
      { initialProps: { empty: true } }
    );
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });

    // Data arrives mid-grace: should jump straight to ready, no empty flash.
    rerender({ empty: false });
    expect(result.current).toEqual({ showSkeleton: false, showEmpty: false });

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });
    expect(result.current).toEqual({ showSkeleton: false, showEmpty: false });
  });

  it("treats local-only mode as settled (no hasSynced wait)", () => {
    syncAccess = "local-only";
    const { result } = renderHook(() =>
      useStableInitialLoading({ dataEmpty: true })
    );

    // Still respects the grace window even in local-only.
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    expect(result.current).toEqual({ showSkeleton: false, showEmpty: true });
  });

  it("forces skeleton while extraGate is true regardless of hasSynced", () => {
    workspaceIndexHasSynced = true;
    const { result, rerender } = renderHook(
      ({ gated }) =>
        useStableInitialLoading({ dataEmpty: true, extraGate: gated }),
      { initialProps: { gated: true } }
    );

    act(() => {
      vi.advanceTimersByTime(GRACE_MS * 2);
    });
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });

    // Once the gate clears, the grace timer (re)starts.
    rerender({ gated: false });
    expect(result.current).toEqual({ showSkeleton: true, showEmpty: false });

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });
    expect(result.current).toEqual({ showSkeleton: false, showEmpty: true });
  });
});
