import { beforeEach, describe, expect, it, vi } from "vitest";

const telemetry = vi.hoisted(() => ({
  failure: vi.fn(),
  start: vi.fn(),
}));

vi.mock("../extensions/host", () => ({
  hasPendingResourceOpen: () => false,
  reportResourceOpenReady: vi.fn(),
  reportResourceOpenFailure: telemetry.failure,
  startResourceOpen: telemetry.start,
  startResourceOpenStage: () => vi.fn(),
}));

import {
  prepareResourceOpen,
  resolveResourceOpenKind,
} from "./resource-open-navigation";

describe("resource open navigation", () => {
  beforeEach(() => {
    telemetry.failure.mockClear();
    telemetry.start.mockClear();
  });

  it("classifies new, loaded, unloaded, and deep-link opens", () => {
    expect(resolveResourceOpenKind(undefined, undefined)).toBe("new");
    expect(resolveResourceOpenKind(undefined, { isUnloaded: false })).toBe(
      "loaded"
    );
    expect(resolveResourceOpenKind(undefined, { isUnloaded: true })).toBe(
      "unloaded"
    );
    expect(resolveResourceOpenKind("deep_link", undefined)).toBe("deep_link");
  });

  it("starts renderer preload without awaiting it", () => {
    const preloadRenderer = vi.fn(() => new Promise<void>(() => undefined));

    expect(
      prepareResourceOpen({
        resourceId: "item_1",
        resourceTypeId: "lunaris.rich-text",
        preloadRenderer,
      })
    ).toBe("new");
    expect(preloadRenderer).toHaveBeenCalledOnce();
    expect(telemetry.start).toHaveBeenCalledOnce();
  });

  it("reports renderer preload failures", async () => {
    prepareResourceOpen({
      resourceId: "item_1",
      resourceTypeId: "lunaris.rich-text",
      preloadRenderer: () => Promise.reject(new Error("chunk failed")),
    });

    await vi.waitFor(() => {
      expect(telemetry.failure).toHaveBeenCalledWith("item_1", "module");
    });
  });
});
