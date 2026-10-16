import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePreloadResourceRenderer,
  usePreloadRichTextRenderer,
} from "./use-preload-resource-renderer";

const state = vi.hoisted(() => ({
  preload: vi.fn(),
  view: vi.fn(),
}));
vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceType: (id: string) => (id ? { defaultViewId: id } : undefined),
  useView: state.view,
}));
import {
  markResourceViewReady,
  releaseResourceViewReady,
} from "./host/resource-view-readiness";
import {
  startResourceOpen,
  _resetResourceOpenPerformanceForTests,
} from "./host/resource-open-performance";

const owners: Array<{ id: string; token: symbol }> = [];
function ready(id: string) {
  const token = Symbol();
  owners.push({ id, token });
  act(() => markResourceViewReady(id, token));
  return () => act(() => releaseResourceViewReady(id, token));
}

describe("renderer warming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("requestIdleCallback", undefined);
    state.preload.mockResolvedValue(undefined);
    state.view.mockImplementation((id: string) =>
      id ? { definition: { preload: state.preload } } : undefined
    );
  });
  afterEach(() => {
    for (const { id, token } of owners.splice(0)) {
      releaseResourceViewReady(id, token);
    }
    _resetResourceOpenPerformanceForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("warms highlighted resource types and ignores absent selection", () => {
    const { rerender } = renderHook(
      ({ type }) => usePreloadResourceRenderer(type),
      { initialProps: { type: undefined as string | undefined } }
    );
    expect(state.preload).not.toHaveBeenCalled();
    rerender({ type: "lunaris.rich-text" });
    expect(state.preload).toHaveBeenCalledOnce();
    rerender({ type: "lunaris.kanban" });
    expect(state.preload).toHaveBeenCalledTimes(2);
  });

  it("waits for active document readiness and cancels work on workspace change", () => {
    const { unmount } = renderHook(() =>
      usePreloadRichTextRenderer("active", true)
    );
    ready("other");
    vi.runOnlyPendingTimers();
    expect(state.preload).not.toHaveBeenCalled();
    ready("active");
    unmount();
    vi.runOnlyPendingTimers();
    expect(state.preload).not.toHaveBeenCalled();
  });

  it("warms once after active document readiness", () => {
    renderHook(() => usePreloadRichTextRenderer("active", true));
    act(() => {
      ready("active");
      ready("active");
    });
    vi.runOnlyPendingTimers();
    expect(state.preload).toHaveBeenCalledOnce();
  });

  it("warms restored views that became ready before subscribing", () => {
    ready("restored");
    renderHook(() => usePreloadRichTextRenderer("restored", true));
    vi.runOnlyPendingTimers();
    expect(state.preload).toHaveBeenCalledOnce();
  });

  it("warms when enabled after the active view is already ready", () => {
    const { rerender } = renderHook(
      ({ enabled }) => usePreloadRichTextRenderer("active", enabled),
      {
        initialProps: { enabled: false },
      }
    );
    ready("active");
    vi.runOnlyPendingTimers();
    expect(state.preload).not.toHaveBeenCalled();
    rerender({ enabled: true });
    vi.runOnlyPendingTimers();
    expect(state.preload).toHaveBeenCalledOnce();
  });

  it("warms even when resource-open telemetry has timed out", () => {
    startResourceOpen({
      resourceId: "slow",
      resourceTypeId: "lunaris.kanban",
      openKind: "new",
    });
    renderHook(() => usePreloadRichTextRenderer("slow", true));
    vi.advanceTimersByTime(5001);
    expect(state.preload).not.toHaveBeenCalled();
    ready("slow");
    vi.runOnlyPendingTimers();
    expect(state.preload).toHaveBeenCalledOnce();
  });

  it("cancels warming when the ready view is unloaded", () => {
    const release = ready("active");
    renderHook(() => usePreloadRichTextRenderer("active", true));
    release();
    vi.runOnlyPendingTimers();
    expect(state.preload).not.toHaveBeenCalled();
  });

  it("does not warm disabled or unavailable extensions", () => {
    state.view.mockReturnValue(undefined);
    renderHook(() => usePreloadRichTextRenderer(undefined, true));
    vi.runOnlyPendingTimers();
    expect(state.preload).not.toHaveBeenCalled();
  });
});
