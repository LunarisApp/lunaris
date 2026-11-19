import {
  buildRevisionHeader,
  buildVersionHeader,
  publicRuntimeConfigSchema,
  setPublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "@repo/app-shell/runtime-config";

declare const __BUILD_REVISION__: string;

const cacheKey = "lunaris.public-runtime-config.v1";

export async function loadRuntimeConfig(options: {
  request: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): Promise<PublicRuntimeConfig> {
  const versionCacheKey = `lunaris.build-version.${__BUILD_REVISION__}`;
  let cachedVersion: string | undefined;
  try {
    cachedVersion = options.storage?.getItem(versionCacheKey) || undefined;
  } catch {
    /* Storage may be disabled. */
  }

  let response: Response;
  try {
    response = await options.request.call(globalThis, "/runtime-config.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Runtime configuration: HTTP ${response.status}`);
    }
  } catch (error) {
    let saved: string | null = null;
    try {
      saved = options.storage?.getItem(cacheKey) ?? null;
    } catch {
      /* Storage may be disabled. */
    }
    if (!saved) {
      throw error;
    }
    const config = publicRuntimeConfigSchema.parse(JSON.parse(saved));
    if (!config.REGION_DIRECTORY_URL) {
      throw new Error("Cached runtime region directory is required");
    }
    setPublicRuntimeConfig(config, cachedVersion);
    return config;
  }
  // Invalid online configuration must fail visibly, not silently use old settings.
  const config = publicRuntimeConfigSchema.parse(await response.json());
  if (!config.REGION_DIRECTORY_URL) {
    throw new Error("Runtime region directory is required");
  }
  // The active service worker may serve a bundle from a previous release.
  const isBundleRevision =
    response.headers.get(buildRevisionHeader) === __BUILD_REVISION__;
  const buildVersion = isBundleRevision
    ? response.headers.get(buildVersionHeader) || undefined
    : cachedVersion;
  setPublicRuntimeConfig(config, buildVersion);
  try {
    options.storage?.setItem(cacheKey, JSON.stringify(config));
    if (isBundleRevision) {
      options.storage?.setItem(versionCacheKey, buildVersion ?? "");
    }
  } catch {
    /* Offline caching is best effort. */
  }
  return config;
}
