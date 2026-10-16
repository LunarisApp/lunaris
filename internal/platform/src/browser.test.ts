import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserPluginArtifactStore,
  createBrowserPlatform,
  detectOperatingSystem,
  getOperatingSystem,
} from "./browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectOperatingSystem", () => {
  it.each([
    ["macOS", "mac"],
    ["Win32", "windows"],
    ["Linux x86_64", "linux"],
    ["", "unknown"],
    [undefined, "unknown"],
  ] as const)("maps %s to %s", (value, expected) => {
    expect(detectOperatingSystem(value)).toBe(expected);
  });

  it("returns undefined outside a browser", () => {
    vi.stubGlobal("navigator", undefined);
    expect(getOperatingSystem()).toBeUndefined();
  });
});

describe("browser plugin artifact store", () => {
  it("keeps URL fragment keys distinct in Cache Storage", async () => {
    const cache = {
      delete: vi.fn(async () => true),
      match: vi.fn(async () => undefined),
      put: vi.fn(
        async (_key: RequestInfo | URL, _response: Response) => undefined
      ),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    const store = createBrowserPluginArtifactStore();
    const url = "https://plugins.example/marketplace.json";

    await store.put(url, new Uint8Array([1]));
    await store.put(`${url}#variant`, new Uint8Array([2]));

    const keys = cache.put.mock.calls.map(([key]) => key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toContain("%23variant");
  });

  it("reads and deletes encoded cache entries", async () => {
    const url = "https://plugins.example/extension.js";
    const cache = {
      delete: vi.fn(async () => true),
      match: vi
        .fn()
        .mockResolvedValue(new Response(Uint8Array.from([7]).buffer)),
      put: vi.fn(),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    const store = createBrowserPluginArtifactStore();

    await expect(store.get(url)).resolves.toEqual(Uint8Array.from([7]));
    await store.delete(url);

    expect(cache.match).toHaveBeenNthCalledWith(
      1,
      `https://cache.lunaris.invalid/${encodeURIComponent(url)}`
    );
    expect(cache.match).toHaveBeenCalledOnce();
    expect(cache.delete).toHaveBeenNthCalledWith(
      1,
      `https://cache.lunaris.invalid/${encodeURIComponent(url)}`
    );
    expect(cache.delete).toHaveBeenCalledOnce();

    cache.match.mockResolvedValueOnce(undefined);
    await expect(store.get(url)).resolves.toBeNull();
    expect(cache.match).toHaveBeenCalledTimes(2);
  });
});

describe("createBrowserPlatform", () => {
  it("owns browser-specific capability calls", async () => {
    const assign = vi.fn();
    const click = vi.fn();
    const open = vi.fn();
    const reload = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const link = {
      click,
      download: "",
      href: "",
      rel: "",
    };

    vi.stubGlobal("document", {
      createElement: vi.fn(() => link),
    });
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
      onLine: true,
      platform: "MacIntel",
    });
    vi.stubGlobal("window", {
      addEventListener,
      innerWidth: 1440,
      location: {
        assign,
        href: "https://app.example/workspace",
        origin: "https://app.example",
        reload,
      },
      open,
      removeEventListener,
    });

    const platform = createBrowserPlatform({ kind: "web" });

    await platform.clipboard.writeText("copy");
    platform.downloads.downloadUrl(
      "https://files.example/export",
      "export.zip"
    );
    platform.navigation.assign("/next");
    platform.navigation.open("mailto:hello@lunaris.app");
    platform.navigation.reload();
    const unsubscribe = platform.network.subscribe(vi.fn());
    unsubscribe();
    const unsubscribeOnline = platform.network.subscribeOnline(vi.fn());
    unsubscribeOnline();

    expect(writeText).toHaveBeenCalledWith("copy");
    expect(link).toMatchObject({
      download: "export.zip",
      href: "https://files.example/export",
      rel: "noopener",
    });
    expect(click).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/next");
    expect(open).toHaveBeenCalledWith("mailto:hello@lunaris.app");
    expect(reload).toHaveBeenCalledOnce();
    expect(platform.navigation.currentUrl()).toBe(
      "https://app.example/workspace"
    );
    expect(platform.navigation.origin()).toBe("https://app.example");
    expect(platform.network.isOnline()).toBe(true);
    expect(platform.operatingSystem()).toBe("mac");
    expect(platform.viewport.width()).toBe(1440);
    expect(addEventListener).toHaveBeenCalledTimes(3);
    expect(removeEventListener).toHaveBeenCalledTimes(3);
  });
});
