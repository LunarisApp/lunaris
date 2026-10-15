import { describe, expect, it, vi } from "vitest";
import { YjsPersistenceTracker } from "./persistence-tracker";

describe("YjsPersistenceTracker", () => {
  it("tracks concurrent writes until all complete", async () => {
    const tracker = new YjsPersistenceTracker();
    tracker.startWrite();
    tracker.startWrite();
    const persisted = tracker.wait();

    tracker.completeWrite();
    expect(tracker.getState()).toBe("persisting");

    tracker.completeWrite();
    await expect(persisted).resolves.toBeUndefined();
    expect(tracker.getState()).toBe("idle");
  });

  it("notifies state changes and supports unsubscribe", () => {
    const tracker = new YjsPersistenceTracker();
    const listener = vi.fn();
    const unsubscribe = tracker.subscribe(listener);

    tracker.startWrite();
    tracker.completeWrite();
    unsubscribe();
    tracker.startWrite();

    expect(listener.mock.calls.map(([state]) => state)).toEqual([
      "idle",
      "persisting",
      "idle",
    ]);
  });

  it("keeps first error sticky and rejects waiters", async () => {
    const tracker = new YjsPersistenceTracker();
    const firstError = new Error("first");
    tracker.startWrite();
    const persisted = tracker.wait();

    expect(tracker.failWrite(firstError)).toBe(firstError);
    expect(tracker.failWrite(new Error("second"))).toBeNull();
    tracker.completeWrite();

    await expect(persisted).rejects.toBe(firstError);
    await expect(tracker.wait()).rejects.toBe(firstError);
    expect(tracker.getState()).toBe("error");
  });
});
