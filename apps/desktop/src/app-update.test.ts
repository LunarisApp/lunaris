import type { AppUpdateState } from "@repo/features/app-update";
import type { Update } from "@tauri-apps/plugin-updater";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDesktopAppUpdateChecks } from "./app-update";

vi.mock("evlog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("evlog")>()),
  log: { warn: vi.fn() },
}));
const stops: (() => void)[] = [];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  const update = {
    version: "1.2.3",
    download: vi.fn<Update["download"]>().mockResolvedValue(undefined),
    install: vi.fn<Update["install"]>().mockResolvedValue(undefined),
    close: vi.fn<Update["close"]>().mockResolvedValue(undefined),
  };
  const dependencies = {
    check: vi
      .fn<() => Promise<typeof update | null>>()
      .mockResolvedValue(update),
    relaunch: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const onChange = vi.fn<(state: AppUpdateState) => void>();
  const start = () => {
    const stop = startDesktopAppUpdateChecks(onChange, dependencies);
    stops.push(stop);
    return stop;
  };
  const state = () => onChange.mock.calls.at(-1)![0];
  return { update, dependencies, onChange, start, state };
}

describe("desktop updates", () => {
  it("checks in background, downloads only on request, reports progress, then installs and restarts", async () => {
    const f = fixture();
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.state()).toMatchObject({
      needRefresh: true,
      requiresRestart: true,
    });
    expect(f.update.download).not.toHaveBeenCalled();
    f.update.download.mockImplementation(async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 30 } });
      expect(f.state()).toMatchObject({ phase: "downloading", progress: 30 });
      const published = f.onChange.mock.calls.length;
      onEvent?.({ event: "Progress", data: { chunkLength: 0 } });
      expect(f.onChange).toHaveBeenCalledTimes(published);
    });
    await f.state().update();
    expect(f.update.install).toHaveBeenCalledOnce();
    expect(f.dependencies.relaunch).toHaveBeenCalledOnce();
    expect(f.state().phase).toBe("restarting");
    expect(f.update.install.mock.invocationCallOrder[0]).toBeLessThan(
      f.dependencies.relaunch.mock.invocationCallOrder[0]!
    );
  });

  it("retries failed downloads without installing unverified bytes", async () => {
    const f = fixture();
    f.update.download.mockRejectedValueOnce(new Error("invalid signature"));
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    await f.state().update();
    expect(f.state()).toMatchObject({ needRefresh: true, failed: true });
    expect(f.state().phase).toBeUndefined();
    expect(f.update.install).not.toHaveBeenCalled();
    expect(f.dependencies.relaunch).not.toHaveBeenCalled();
    await f.state().update();
    expect(f.update.download).toHaveBeenCalledTimes(2);
    expect(f.update.install).toHaveBeenCalledOnce();
  });

  it("retries a failed restart without downloading or installing again", async () => {
    const f = fixture();
    f.dependencies.relaunch.mockRejectedValueOnce(new Error("restart failed"));
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    await f.state().update();
    expect(f.state().failed).toBe(true);
    await f.state().update();
    expect(f.update.download).toHaveBeenCalledOnce();
    expect(f.update.install).toHaveBeenCalledOnce();
    expect(f.dependencies.relaunch).toHaveBeenCalledTimes(2);
  });

  it("retries installation using the verified download without restarting on failure", async () => {
    const f = fixture();
    f.update.install.mockRejectedValueOnce(new Error("install failed"));
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    await f.state().update();
    expect(f.state()).toMatchObject({ needRefresh: true, failed: true });
    expect(f.dependencies.relaunch).not.toHaveBeenCalled();
    await f.state().update();
    expect(f.update.download).toHaveBeenCalledOnce();
    expect(f.update.install).toHaveBeenCalledTimes(2);
    expect(f.dependencies.relaunch).toHaveBeenCalledOnce();
  });

  it("serializes checks and double clicks, and defers resource cleanup during installation", async () => {
    const f = fixture();
    const pendingCheck = deferred<typeof f.update>();
    f.dependencies.check.mockReturnValue(pendingCheck.promise);
    const stop = f.start();
    window.dispatchEvent(new Event("online"));
    expect(f.dependencies.check).toHaveBeenCalledOnce();
    pendingCheck.resolve(f.update);
    await vi.advanceTimersByTimeAsync(0);
    const pendingDownload = deferred<void>();
    f.update.download.mockReturnValue(pendingDownload.promise);
    const action = f.state().update();
    await f.state().update();
    expect(f.update.download).toHaveBeenCalledOnce();
    stop();
    expect(f.update.close).not.toHaveBeenCalled();
    pendingDownload.resolve();
    await action;
    expect(f.update.close).toHaveBeenCalledOnce();
  });

  it("skips offline and hidden checks, retries on return and hourly, then removes listeners", async () => {
    const f = fixture();
    f.dependencies.check.mockResolvedValue(null);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const stop = f.start();
    expect(f.dependencies.check).not.toHaveBeenCalled();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    window.dispatchEvent(new Event("online"));
    expect(f.dependencies.check).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    f.dependencies.check.mockRejectedValueOnce(new Error("offline"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(f.dependencies.check).toHaveBeenCalledTimes(2);
    expect(f.state().needRefresh).toBe(false);
    stop();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(f.dependencies.check).toHaveBeenCalledTimes(2);
  });

  it("closes results from a check completed after unmount", async () => {
    const f = fixture();
    const pending = deferred<typeof f.update>();
    f.dependencies.check.mockReturnValue(pending.promise);
    const stop = f.start();
    stop();
    pending.resolve(f.update);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.onChange).not.toHaveBeenCalled();
    expect(f.update.close).toHaveBeenCalledOnce();
  });
});
