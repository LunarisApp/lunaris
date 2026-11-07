import type { PlatformPlugins } from "@repo/platform";
import { describe, expect, it, vi } from "vitest";
import { sha256, verifiedAsset } from "./artifacts";

async function fixture(source = "release one") {
  const bytes = new TextEncoder().encode(source);
  const asset = {
    bytes: bytes.byteLength,
    resource: "text/javascript",
    sha256: await sha256(bytes),
    url: "https://extensions.example/main.js",
  };
  const values = new Map<string, Uint8Array>();
  const plugins: PlatformPlugins = {
    artifacts: {
      delete: vi.fn(async (key) => {
        values.delete(key);
      }),
      get: vi.fn(async (key) => values.get(key)?.slice() ?? null),
      put: vi.fn(async (key, value) => {
        values.set(key, value.slice());
      }),
    },
    fetch: vi.fn(async () => new Response(bytes)) as unknown as typeof fetch,
  };
  return { asset, bytes, plugins, values };
}

describe("verified artifact caching", () => {
  it("shares concurrent downloads and warm cache reads, with isolated bytes", async () => {
    const { asset, bytes, plugins } = await fixture();
    const read = () => verifiedAsset(asset, 1024, plugins);
    const [first, second] = await Promise.all([read(), read(), read()]);

    expect(plugins.fetch).toHaveBeenCalledOnce();
    expect(plugins.artifacts.put).toHaveBeenCalledOnce();
    first![0] = 0;
    expect(second).toEqual(bytes);

    vi.mocked(plugins.artifacts.get).mockClear();
    await Promise.all([read(), read(), read()]);
    expect(plugins.artifacts.get).toHaveBeenCalledOnce();
    expect(plugins.fetch).toHaveBeenCalledOnce();
  });

  it("preserves different pinned releases at the same URL for offline use", async () => {
    const { asset, bytes, plugins } = await fixture();
    const next = await fixture("release two");
    await verifiedAsset(asset, 1024, plugins);
    vi.mocked(plugins.fetch).mockResolvedValueOnce(new Response(next.bytes));
    await verifiedAsset(next.asset, 1024, plugins);

    await expect(
      verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
    ).resolves.toEqual(bytes);
    await expect(
      verifiedAsset(next.asset, 1024, plugins, { allowNetwork: false })
    ).resolves.toEqual(next.bytes);
    expect(plugins.fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(plugins.fetch).mock.calls[1]?.[1]?.cache).toBe("no-cache");
  });

  it("migrates verified URL-only cache entries without network access", async () => {
    const { asset, bytes, plugins, values } = await fixture();
    values.set(asset.url, bytes);

    await expect(
      verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
    ).resolves.toEqual(bytes);
    expect(values.has(asset.url)).toBe(false);
    expect(values.size).toBe(1);
    expect(plugins.artifacts.put).toHaveBeenCalledOnce();
    expect(plugins.fetch).not.toHaveBeenCalled();

    await expect(
      verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
    ).resolves.toEqual(bytes);
  });

  it.each([true, false])(
    "preserves legacy bytes for another release (allowNetwork: %s)",
    async (allowNetwork) => {
      const { asset, bytes, plugins, values } = await fixture();
      const next = await fixture("release two");
      values.set(asset.url, bytes);
      vi.mocked(plugins.fetch).mockResolvedValueOnce(new Response(next.bytes));

      const request = verifiedAsset(next.asset, 1024, plugins, {
        allowNetwork,
      });
      if (allowNetwork) {
        await expect(request).resolves.toEqual(next.bytes);
      } else {
        await expect(request).rejects.toThrow("not cached");
      }
      expect(values.get(asset.url)).toEqual(bytes);
      await expect(
        verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
      ).resolves.toEqual(bytes);
      expect(plugins.fetch).toHaveBeenCalledTimes(allowNetwork ? 1 : 0);
    }
  );

  it("rechecks persisted bytes after completion and evicts corruption", async () => {
    const { asset, plugins, values } = await fixture();
    await verifiedAsset(asset, 1024, plugins);
    for (const value of values.values()) {
      value[0] = 0;
    }

    await expect(
      verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
    ).rejects.toThrow("cache is corrupt");
    expect(values.size).toBe(0);
    expect(plugins.fetch).toHaveBeenCalledOnce();
  });

  it("keeps legacy offline bytes usable when migration cannot write", async () => {
    const { asset, bytes, plugins, values } = await fixture();
    values.set(asset.url, bytes);
    vi.mocked(plugins.artifacts.put).mockRejectedValue(new Error("quota"));

    await expect(
      verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
    ).resolves.toEqual(bytes);
    expect(values.get(asset.url)).toEqual(bytes);
    expect(plugins.artifacts.delete).not.toHaveBeenCalled();
    expect(plugins.fetch).not.toHaveBeenCalled();
  });

  it("does not share pending network requests with offline callers", async () => {
    const { asset, bytes, plugins } = await fixture();
    let finish = (_response: Response) => {};
    vi.mocked(plugins.fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const online = verifiedAsset(asset, 1024, plugins);
    await expect(
      verifiedAsset(asset, 1024, plugins, { allowNetwork: false })
    ).rejects.toThrow("not cached");
    finish(new Response(bytes));
    await expect(online).resolves.toEqual(bytes);
    expect(plugins.fetch).toHaveBeenCalledOnce();
  });

  it("retries failed requests and still enforces each caller's size limit", async () => {
    const { asset, bytes, plugins } = await fixture();
    vi.mocked(plugins.fetch).mockRejectedValueOnce(new Error("offline"));
    const failed = await Promise.allSettled([
      verifiedAsset(asset, 1024, plugins),
      verifiedAsset(asset, 1024, plugins),
    ]);
    expect(failed.every((result) => result.status === "rejected")).toBe(true);
    expect(plugins.fetch).toHaveBeenCalledOnce();

    const retry = verifiedAsset(asset, 1024, plugins);
    await expect(verifiedAsset(asset, 1, plugins)).rejects.toThrow("exceeds");
    await expect(retry).resolves.toEqual(bytes);
    expect(plugins.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps separate platform stores isolated", async () => {
    const first = await fixture();
    const second = await fixture();
    await Promise.all([
      verifiedAsset(first.asset, 1024, first.plugins),
      verifiedAsset(second.asset, 1024, second.plugins),
    ]);
    expect(first.plugins.fetch).toHaveBeenCalledOnce();
    expect(second.plugins.fetch).toHaveBeenCalledOnce();
    expect(first.values.size).toBe(1);
    expect(second.values.size).toBe(1);
  });
});
