import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));
vi.mock(
  "../extensions/host",
  async () => import("../extensions/host/resource-open-performance")
);

import {
  prepareResourceOpen,
  trackResourceViewActivation,
} from "./resource-open-navigation";
import {
  _resetResourceOpenPerformanceForTests,
  reportResourceOpenReady,
} from "../extensions/host/resource-open-performance";
import {
  markResourceViewReady,
  releaseResourceViewReady,
} from "../extensions/host/resource-view-readiness";

describe("native resource view activation", () => {
  const owner = Symbol();
  const input = { resourceId: "document", resourceTypeId: "lunaris.rich-text" };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("MODE", "production");
    vi.spyOn(Math, "random").mockReturnValue(0);
    capture.mockClear();
  });
  afterEach(() => {
    releaseResourceViewReady(input.resourceId, owner);
    _resetResourceOpenPerformanceForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  function paint() {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  }

  it("times a retained view through the next rendering opportunity", () => {
    markResourceViewReady(input.resourceId, owner);
    trackResourceViewActivation(input);
    expect(capture).not.toHaveBeenCalled();
    paint();
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      "resource_open_performance",
      expect.objectContaining({ open_kind: "loaded", success: true })
    );
  });

  it("waits for renderer readiness when the activated view was unloaded", () => {
    trackResourceViewActivation(input);
    paint();
    expect(capture).not.toHaveBeenCalled();
    markResourceViewReady(input.resourceId, owner);
    reportResourceOpenReady(input.resourceId);
    paint();
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      "resource_open_performance",
      expect.objectContaining({ open_kind: "unloaded", success: true })
    );
  });

  it("preserves the attempt and preload started by tree/search navigation", () => {
    const mark = vi.spyOn(performance, "mark");
    const preloadRenderer = vi.fn(async () => undefined);
    prepareResourceOpen({ ...input, preloadRenderer });
    trackResourceViewActivation({ ...input, preloadRenderer });
    expect(
      mark.mock.calls.filter(([name]) => name === "resource-open:start")
    ).toHaveLength(1);
    expect(preloadRenderer).toHaveBeenCalledOnce();
    reportResourceOpenReady(input.resourceId);
    paint();
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      "resource_open_performance",
      expect.objectContaining({ open_kind: "new", success: true })
    );
  });
});
