import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));

import {
  _resetResourceOpenPerformanceForTests,
  markResourceOpenDataReady,
  markResourceOpenPanelMounted,
  reportResourceOpenFailure,
  reportResourceOpenReady,
  startResourceOpen,
  startResourceOpenStage,
} from "./resource-open-performance";

describe("resource open performance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  function paint() {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  }
  afterEach(() => {
    _resetResourceOpenPerformanceForTests();
    capture.mockClear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function sampleProductionOpens() {
    vi.stubEnv("MODE", "production");
    vi.spyOn(Math, "random").mockReturnValue(0);
  }

  it("emits only the approved sampled fields", () => {
    sampleProductionOpens();
    startResourceOpen({
      resourceId: "secret-item-id",
      openKind: "new",
      resourceTypeId: "lunaris.rich-text",
    });
    markResourceOpenPanelMounted("secret-item-id");
    markResourceOpenDataReady("secret-item-id", "sqlite");
    reportResourceOpenReady("secret-item-id");
    paint();

    expect(capture).toHaveBeenCalledTimes(1);
    const [event, properties] = capture.mock.calls[0]!;
    expect(event).toBe("resource_open_performance");
    expect(Object.keys(properties).sort()).toEqual(
      [
        "cache_outcome",
        "queue_wait_ms",
        "module_ms",
        "resolution_ms",
        "visible_ready_ms",
        "paint_wait_ms",
        "data_ms",
        "failure_stage",
        "open_kind",
        "panel_ms",
        "resource_type_id",
        "renderer_ms",
        "success",
        "total_ms",
      ].sort()
    );
    expect(properties).toMatchObject({ cache_outcome: "sqlite" });
    expect(JSON.stringify(properties)).not.toContain("secret-");
  });

  it("does not capture unsampled development opens", () => {
    vi.stubEnv("MODE", "development");
    vi.spyOn(Math, "random").mockReturnValue(0);
    startResourceOpen({
      resourceId: "item_1",
      openKind: "new",
      resourceTypeId: "lunaris.rich-text",
    });
    reportResourceOpenReady("item_1");
    paint();

    expect(capture).not.toHaveBeenCalled();
  });

  it("reports resource failures", () => {
    sampleProductionOpens();
    startResourceOpen({
      resourceId: "item_1",
      openKind: "new",
      resourceTypeId: "lunaris.rich-text",
    });
    reportResourceOpenFailure("item_1", "yjs");

    expect(capture).toHaveBeenCalledWith(
      "resource_open_performance",
      expect.objectContaining({ failure_stage: "yjs", success: false })
    );
  });

  it("expires unfinished attempts after five seconds", () => {
    sampleProductionOpens();
    vi.useFakeTimers();
    startResourceOpen({
      resourceId: "item_1",
      openKind: "new",
      resourceTypeId: "lunaris.rich-text",
    });

    vi.advanceTimersByTime(5_000);

    expect(capture).toHaveBeenCalledWith(
      "resource_open_performance",
      expect.objectContaining({ failure_stage: "timeout", success: false })
    );
  });

  it("replaces an unfinished attempt for the same resource", () => {
    sampleProductionOpens();
    startResourceOpen({
      resourceId: "item_1",
      openKind: "new",
      resourceTypeId: "lunaris.rich-text",
    });
    startResourceOpen({
      cacheOutcome: "loaded",
      resourceId: "item_1",
      openKind: "loaded",
      resourceTypeId: "lunaris.rich-text",
    });
    markResourceOpenPanelMounted("item_1", true);
    reportResourceOpenReady("item_1");
    paint();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      "resource_open_performance",
      expect.objectContaining({ cache_outcome: "loaded", open_kind: "loaded" })
    );
  });

  it("records all local timing stages", () => {
    const mark = vi.spyOn(performance, "mark");
    const measure = vi.spyOn(performance, "measure");
    startResourceOpen({
      resourceId: "item_1",
      openKind: "new",
      resourceTypeId: "lunaris.rich-text",
    });
    markResourceOpenPanelMounted("item_1");
    markResourceOpenDataReady("item_1", "sqlite");
    reportResourceOpenReady("item_1");
    paint();

    expect(mark.mock.calls.map(([name]) => name)).toEqual([
      "resource-open:start",
      "resource-open:panel-mounted",
      "resource-open:data-ready",
      "resource-open:ready",
    ]);
    expect(measure.mock.calls.map(([name]) => name)).toEqual([
      "resource-open:panel",
      "resource-open:data",
      "resource-open:renderer",
      "resource-open:total",
    ]);
  });
  it("waits for a rendering opportunity before reporting a warm open", () => {
    sampleProductionOpens();
    startResourceOpen({
      resourceId: "item_1",
      resourceTypeId: "lunaris.rich-text",
      openKind: "loaded",
    });
    reportResourceOpenReady("item_1");
    expect(capture).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(capture).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]![1].paint_wait_ms).toBeGreaterThan(0);
  });

  it("does not finish a replacement attempt from an older frame or stage", () => {
    sampleProductionOpens();
    const input = {
      resourceId: "item_1",
      resourceTypeId: "lunaris.rich-text",
      openKind: "new" as const,
    };
    startResourceOpen(input);
    const finishOldStage = startResourceOpenStage("item_1", "module");
    reportResourceOpenReady("item_1");
    startResourceOpen(input);
    finishOldStage();
    paint();
    expect(capture).not.toHaveBeenCalled();
    reportResourceOpenReady("item_1");
    paint();
    expect(capture.mock.calls[0]![1].module_ms).toBeUndefined();
  });

  it("measures stages independently and clips pre-click queue time", () => {
    sampleProductionOpens();
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(105)
      .mockReturnValueOnce(125)
      .mockReturnValue(150);
    startResourceOpen({
      resourceId: "item_1",
      resourceTypeId: "lunaris.rich-text",
      openKind: "new",
    });
    const finish = startResourceOpenStage("item_1", "resolution");
    finish();
    finish();
    markResourceOpenDataReady("item_1", "shared", {
      queuedAt: 50,
      loadStartedAt: 110,
    });
    reportResourceOpenReady("item_1");
    paint();
    expect(capture.mock.calls[0]![1]).toMatchObject({
      resolution_ms: 20,
      queue_wait_ms: 10,
    });
  });
});
