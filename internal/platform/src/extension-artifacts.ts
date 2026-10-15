import type { PlatformPlugins } from "./platform";

export const OFFICIAL_EXTENSION_MARKETPLACE_URL =
  "https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json";
const MAX_PLUGIN_JSON_BYTES = 5 * 1024 * 1024;
const PLUGIN_JSON_TIMEOUT_MS = 10_000;
const JSON_CACHE_PREFIX = new TextEncoder().encode("lunaris-json-cache-v1\n");

interface JsonCacheMetadata {
  etag?: string;
  sha256: string;
}

async function digest(value: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", Uint8Array.from(value));
  return Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readMetadata(
  url: string,
  plugins: PlatformPlugins,
): Promise<JsonCacheMetadata | null> {
  const cached = await plugins.artifacts.get(url);
  if (!cached) return null;
  try {
    return decodeCacheEnvelope(cached).metadata;
  } catch {
    await plugins.artifacts.delete(url);
    return null;
  }
}

function decodeJson(value: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(value));
}

function decodeCacheEnvelope(value: Uint8Array): {
  bytes: Uint8Array;
  metadata: JsonCacheMetadata;
} {
  if (
    value.byteLength < JSON_CACHE_PREFIX.byteLength ||
    !JSON_CACHE_PREFIX.every((byte, index) => value[index] === byte)
  ) {
    throw new Error("Invalid JSON cache envelope");
  }
  const metadataEnd = value.indexOf(10, JSON_CACHE_PREFIX.byteLength);
  if (metadataEnd < 0) throw new Error("Invalid JSON cache metadata");
  const metadata = JSON.parse(
    new TextDecoder().decode(
      value.subarray(JSON_CACHE_PREFIX.byteLength, metadataEnd),
    ),
  ) as JsonCacheMetadata;
  if (!metadata.sha256) throw new Error("Invalid JSON cache digest");
  return { bytes: value.subarray(metadataEnd + 1), metadata };
}

function encodeCacheEnvelope(
  value: Uint8Array,
  metadata: JsonCacheMetadata,
): Uint8Array {
  const header = new TextEncoder().encode(`${JSON.stringify(metadata)}\n`);
  const output = new Uint8Array(
    JSON_CACHE_PREFIX.byteLength + header.byteLength + value.byteLength,
  );
  output.set(JSON_CACHE_PREFIX);
  output.set(header, JSON_CACHE_PREFIX.byteLength);
  output.set(value, JSON_CACHE_PREFIX.byteLength + header.byteLength);
  return output;
}

export async function readResponseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`Response exceeds ${maximumBytes} bytes`);
  }

  if (!response.body) {
    const value = new Uint8Array(await response.arrayBuffer());
    if (value.byteLength > maximumBytes) {
      throw new Error(`Response exceeds ${maximumBytes} bytes`);
    }
    return value;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`Response exceeds ${maximumBytes} bytes`);
    }
    chunks.push(value);
  }

  const output = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function readCachedJson<T>(
  url: string,
  plugins: PlatformPlugins,
  parse: (value: unknown) => T,
): Promise<T | null> {
  const cached = await plugins.artifacts.get(url);
  if (!cached) return null;
  try {
    const { bytes: value, metadata } = decodeCacheEnvelope(cached);
    if (value.byteLength > MAX_PLUGIN_JSON_BYTES) {
      throw new Error("Cached JSON exceeds maximum size");
    }
    if ((await digest(value)) !== metadata.sha256) {
      await plugins.artifacts.delete(url);
      return null;
    }
    return parse(decodeJson(value));
  } catch {
    await plugins.artifacts.delete(url);
    return null;
  }
}

export async function fetchAndCacheJson<T>(
  url: string,
  plugins: PlatformPlugins,
  parse: (value: unknown) => T,
): Promise<T> {
  const cachedMetadata = await readMetadata(url, plugins);
  const headers = new Headers();
  if (cachedMetadata?.etag) {
    headers.set("If-None-Match", cachedMetadata.etag);
  }
  const response = await plugins.fetch(url, {
    cache: "no-cache",
    credentials: "omit",
    headers,
    signal: AbortSignal.timeout(PLUGIN_JSON_TIMEOUT_MS),
  });
  if (response.status === 304) {
    const cached = await readCachedJson(url, plugins, parse);
    if (cached) return cached;
    throw new Error("Server returned 304 without a valid cached response");
  }
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const value = await readResponseBytes(response, MAX_PLUGIN_JSON_BYTES);
  const parsed = parse(decodeJson(value));
  const metadata = {
    etag: response.headers.get("etag") ?? undefined,
    sha256: await digest(value),
  } satisfies JsonCacheMetadata;
  await plugins.artifacts.put(url, encodeCacheEnvelope(value, metadata));
  return parsed;
}

export async function fetchCachedJson<T>(
  url: string,
  plugins: PlatformPlugins,
  parse: (value: unknown) => T,
  { allowNetwork = true }: { allowNetwork?: boolean } = {},
): Promise<T> {
  const cached = await readCachedJson(url, plugins, parse);
  if (cached) return cached;
  if (!allowNetwork) throw new Error("Cached extension resource unavailable");
  return fetchAndCacheJson(url, plugins, parse);
}
