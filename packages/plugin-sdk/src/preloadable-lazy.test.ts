import { describe, expect, it, vi } from "vitest";
import { createPreloadableLazy } from "./preloadable-lazy";

const Component = () => null;

describe("createPreloadableLazy", () => {
  it("shares one in-flight import and caches success", async () => {
    const loader = vi.fn(async () => ({ default: Component }));
    const module = createPreloadableLazy(loader);

    await Promise.all([module.preload(), module.preload(), module.preload()]);
    await module.preload();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("clears a failed import so intent can retry", async () => {
    const loader = vi
      .fn<() => Promise<{ default: typeof Component }>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue({ default: Component });
    const module = createPreloadableLazy(loader);

    await expect(module.preload()).rejects.toThrow("chunk failed");
    await expect(module.preload()).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
