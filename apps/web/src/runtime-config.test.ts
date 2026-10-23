import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publicConfigFromEnvironment,
  setPublicRuntimeConfig,
} from "@repo/app-shell/runtime-config";
import { loadRuntimeConfig } from "./runtime-config";

const config = {
  REGION_DIRECTORY_URL: "/regions.json",
  POSTHOG_KEY: "public-key",
};
afterEach(() => {
  vi.restoreAllMocks();
  setPublicRuntimeConfig();
});
describe("web runtime configuration", () => {
  it("serves only allowlisted public variables", () => {
    expect(
      publicConfigFromEnvironment({
        VITE_REGION_DIRECTORY_URL: "/regions.json",
        DATABASE_PASSWORD: "secret",
        VITE_UNKNOWN_SECRET: "secret",
      })
    ).toEqual({ REGION_DIRECTORY_URL: "/regions.json" });
  });
  it("loads public settings before boot and caches validated configuration", async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const request = vi.fn().mockResolvedValue(Response.json(config));
    await expect(loadRuntimeConfig({ request, storage })).resolves.toEqual(
      config
    );
    expect(request.mock.calls[0]?.[1].cache).toBe("no-store");
    expect(storage.setItem).toHaveBeenCalledWith(
      "lunaris.public-runtime-config.v1",
      JSON.stringify(config)
    );
  });
  it("returning users can boot offline with last validated settings", async () => {
    const request = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(
      loadRuntimeConfig({
        request,
        storage: { getItem: () => JSON.stringify(config), setItem: vi.fn() },
      })
    ).resolves.toEqual(config);
    await expect(loadRuntimeConfig({ request })).rejects.toThrow("offline");
  });
  it("invalid online settings never fall back to old configuration", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...config, DATABASE_PASSWORD: "secret" })
      );
    await expect(
      loadRuntimeConfig({
        request,
        storage: { getItem: () => JSON.stringify(config), setItem: vi.fn() },
      })
    ).rejects.toThrow();
  });
  it("disabled storage still permits a fresh online boot", async () => {
    await expect(
      loadRuntimeConfig({
        request: vi.fn().mockResolvedValue(Response.json(config)),
        storage: {
          getItem: () => {
            throw new Error("disabled");
          },
          setItem: () => {
            throw new Error("disabled");
          },
        },
      })
    ).resolves.toEqual(config);
  });
});
