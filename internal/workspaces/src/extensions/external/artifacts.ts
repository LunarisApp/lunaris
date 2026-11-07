import type { PluginAsset } from "@lunarisapp/plugin-sdk/marketplace";
import { readResponseBytes, type PlatformPlugins } from "@repo/platform";

const PLUGIN_ASSET_TIMEOUT_MS = 30_000;
const pendingAssets = new WeakMap<
  PlatformPlugins,
  Map<string, Promise<Uint8Array>>
>();

export async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(value).buffer
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function verifiedAsset(
  asset: PluginAsset,
  maximumBytes: number,
  plugins: PlatformPlugins,
  { allowNetwork = true }: { allowNetwork?: boolean } = {}
): Promise<Uint8Array> {
  if (asset.bytes > maximumBytes) {
    throw new Error(`Extension asset exceeds ${maximumBytes} bytes`);
  }

  // Share verification/download work across metadata, prefetch, and runtime loads.
  // Offline callers must never wait for an in-flight network request.
  const requestKey = JSON.stringify([
    asset.url,
    asset.sha256,
    asset.bytes,
    allowNetwork,
  ]);
  let pending = pendingAssets.get(plugins);
  if (!pending) {
    pending = new Map();
    pendingAssets.set(plugins, pending);
  }
  let request = pending.get(requestKey);
  if (!request) {
    request = readVerifiedAsset(asset, plugins, allowNetwork).finally(() => {
      pending.delete(requestKey);
    });
    pending.set(requestKey, request);
  }
  // Each consumer owns its bytes; retain no resolved in-memory artifact cache.
  return (await request).slice();
}

async function readVerifiedAsset(
  asset: PluginAsset,
  plugins: PlatformPlugins,
  allowNetwork: boolean
): Promise<Uint8Array> {
  // A publisher may reuse a URL. Keep pinned releases available independently.
  const cacheKey = `lunaris-extension-asset-v1:${asset.sha256}:${asset.url}`;
  let sourceKey = cacheKey;
  let cached = await plugins.artifacts.get(cacheKey);
  if (!cached) {
    sourceKey = asset.url;
    cached = await plugins.artifacts.get(sourceKey);
  }
  if (
    cached &&
    cached.byteLength === asset.bytes &&
    (await sha256(cached)) === asset.sha256
  ) {
    if (sourceKey !== cacheKey) {
      // Migrate existing offline installations only after verifying their bytes.
      try {
        await plugins.artifacts.put(cacheKey, cached);
        await plugins.artifacts.delete(sourceKey);
      } catch {
        // A full/read-only store must not break a working offline installation.
      }
    }
    return cached;
  }
  // Legacy URL-only bytes may belong to another pinned release. A mismatch
  // cannot establish corruption, so leave them available for that release.
  const corruptCache = Boolean(cached) && sourceKey === cacheKey;
  if (corruptCache) {
    await plugins.artifacts.delete(sourceKey);
  }
  if (!allowNetwork) {
    throw new Error(
      corruptCache
        ? "Extension artifact cache is corrupt"
        : "Extension artifact is not cached"
    );
  }

  let response: Response;
  try {
    response = await plugins.fetch(asset.url, {
      cache: "no-cache",
      credentials: "omit",
      signal: AbortSignal.timeout(PLUGIN_ASSET_TIMEOUT_MS),
    });
  } catch (cause) {
    if (corruptCache) {
      throw new Error(
        "Extension artifact cache is corrupt and refetch failed",
        {
          cause,
        }
      );
    }
    throw cause;
  }
  if (!response.ok) {
    if (corruptCache) {
      throw new Error(
        `Extension artifact cache is corrupt and refetch failed (${response.status})`
      );
    }
    throw new Error(`Extension asset request failed (${response.status})`);
  }
  let value: Uint8Array;
  try {
    value = await readResponseBytes(response, asset.bytes);
  } catch (cause) {
    throw new Error("Extension asset size does not match catalog", { cause });
  }
  if (value.byteLength !== asset.bytes) {
    throw new Error("Extension asset size does not match catalog");
  }
  if ((await sha256(value)) !== asset.sha256) {
    throw new Error("Extension asset checksum does not match catalog");
  }
  await plugins.artifacts.put(cacheKey, value);
  return value;
}
