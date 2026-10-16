import type { PluginAsset } from "@lunarisapp/plugin-sdk/marketplace";
import { readResponseBytes, type PlatformPlugins } from "@repo/platform";

const PLUGIN_ASSET_TIMEOUT_MS = 30_000;

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

  const cached = await plugins.artifacts.get(asset.url);
  if (
    cached &&
    cached.byteLength === asset.bytes &&
    (await sha256(cached)) === asset.sha256
  ) {
    return cached;
  }
  const corruptCache = Boolean(cached);
  if (corruptCache) {
    await plugins.artifacts.delete(asset.url);
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
  await plugins.artifacts.put(asset.url, value);
  return value;
}
