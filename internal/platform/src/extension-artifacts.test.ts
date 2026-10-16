import type { PlatformPlugins } from "./platform";
import { describe, expect, it, vi } from "vitest";
import {
  OFFICIAL_EXTENSION_MARKETPLACE_URL,
  fetchAndCacheJson,
  fetchCachedJson,
  readCachedJson,
  readResponseBytes,
} from "./extension-artifacts";

const parse = (value: unknown) => value;

function plugins(cached: Uint8Array | null = null): PlatformPlugins {
  return {
    artifacts: {
      delete: vi.fn(),
      get: vi.fn(async () => cached),
      put: vi.fn(),
    },
    fetch: vi.fn(
      async () => new Response('{"source":"network"}')
    ) as unknown as typeof fetch,
  };
}

function storedPlugins() {
  const values = new Map<string, Uint8Array>();
  return {
    plugins: {
      artifacts: {
        delete: vi.fn(async (key: string) => {
          values.delete(key);
        }),
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        put: vi.fn(async (key: string, value: Uint8Array) => {
          values.set(key, value);
        }),
      },
      fetch: vi.fn(),
    } as unknown as PlatformPlugins,
    values,
  };
}

describe("fetchCachedJson", () => {
  it("uses the official GitHub marketplace by default", () => {
    expect(OFFICIAL_EXTENSION_MARKETPLACE_URL).toBe(
      "https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json"
    );
  });

  it("caches successful responses", async () => {
    const platformPlugins = plugins();

    await expect(
      fetchCachedJson(
        "https://plugins.example/catalog.json",
        platformPlugins,
        parse
      )
    ).resolves.toEqual({ source: "network" });
    expect(platformPlugins.artifacts.put).toHaveBeenCalledOnce();
  });

  it("uses cached bytes without starting a request", async () => {
    const { plugins: platformPlugins } = storedPlugins();
    vi.mocked(platformPlugins.fetch).mockResolvedValue(
      new Response('{"source":"cache"}')
    );
    await fetchAndCacheJson(
      "https://plugins.example/catalog.json",
      platformPlugins,
      parse
    );
    vi.mocked(platformPlugins.fetch).mockClear();
    await expect(
      fetchCachedJson(
        "https://plugins.example/catalog.json",
        platformPlugins,
        parse
      )
    ).resolves.toEqual({ source: "cache" });
    expect(platformPlugins.fetch).not.toHaveBeenCalled();
  });

  it("does not fetch on an offline cache miss", async () => {
    const platformPlugins = plugins();

    await expect(
      fetchCachedJson(
        "https://plugins.example/catalog.json",
        platformPlugins,
        parse,
        { allowNetwork: false }
      )
    ).rejects.toThrow("Cached extension resource unavailable");
    expect(platformPlugins.fetch).not.toHaveBeenCalled();
  });

  it("deletes corrupt cached JSON", async () => {
    const platformPlugins = plugins(new TextEncoder().encode("not json"));

    await expect(
      readCachedJson(
        "https://plugins.example/catalog.json",
        platformPlugins,
        parse
      )
    ).resolves.toBeNull();
    expect(platformPlugins.artifacts.delete).toHaveBeenCalledWith(
      "https://plugins.example/catalog.json"
    );
  });

  it.each([fetchCachedJson, fetchAndCacheJson])(
    "%s refetches old raw JSON without using sidecar metadata",
    async (fetchJson) => {
      const { plugins: platformPlugins, values } = storedPlugins();
      const url = "https://plugins.example/catalog.json";
      values.set(url, new TextEncoder().encode('{"source":"cache"}'));
      values.set(
        `${url}#lunaris-cache-metadata`,
        new TextEncoder().encode(
          JSON.stringify({ etag: '"old-release"', sha256: "old-digest" })
        )
      );
      vi.mocked(platformPlugins.fetch).mockResolvedValue(
        new Response('{"source":"network"}')
      );

      await expect(fetchJson(url, platformPlugins, parse)).resolves.toEqual({
        source: "network",
      });
      const request = vi.mocked(platformPlugins.fetch).mock.calls[0]?.[1];
      expect(new Headers(request?.headers).has("If-None-Match")).toBe(false);
      expect(platformPlugins.artifacts.get).not.toHaveBeenCalledWith(
        `${url}#lunaris-cache-metadata`
      );
      await expect(
        readCachedJson(url, platformPlugins, parse)
      ).resolves.toEqual({
        source: "network",
      });
    }
  );

  it("revalidates with ETag and reuses exact cached bytes on 304", async () => {
    const { plugins: platformPlugins } = storedPlugins();
    vi.mocked(platformPlugins.fetch)
      .mockResolvedValueOnce(
        new Response('{"source":"network"}', {
          headers: { etag: '"release-1"' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const url = "https://plugins.example/marketplace.json";

    await fetchAndCacheJson(url, platformPlugins, parse);
    await expect(
      fetchAndCacheJson(url, platformPlugins, parse)
    ).resolves.toEqual({
      source: "network",
    });

    const secondRequest = vi.mocked(platformPlugins.fetch).mock.calls[1]?.[1];
    expect(new Headers(secondRequest?.headers).get("If-None-Match")).toBe(
      '"release-1"'
    );
  });

  it("rejects cached bytes that do not match their stored digest", async () => {
    const { plugins: platformPlugins, values } = storedPlugins();
    const url = "https://plugins.example/marketplace.json";
    vi.mocked(platformPlugins.fetch).mockResolvedValue(
      new Response('{"source":"network"}')
    );
    await fetchAndCacheJson(url, platformPlugins, parse);
    const cached = values.get(url)!;
    const tampered = cached.slice();
    tampered[tampered.byteLength - 3] = "2".charCodeAt(0);
    values.set(url, tampered);

    await expect(
      readCachedJson(url, platformPlugins, parse)
    ).resolves.toBeNull();
    expect(values.has(url)).toBe(false);
  });
});

describe("readResponseBytes", () => {
  it("rejects streamed responses above the byte limit", async () => {
    await expect(
      readResponseBytes(new Response(new Uint8Array(9)), 8)
    ).rejects.toThrow("exceeds 8 bytes");
  });
});
