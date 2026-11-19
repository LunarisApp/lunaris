import {
  buildVersionHeader,
  publicRuntimeConfigSchema,
  setPublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "@repo/app-shell/runtime-config";

const cacheKey = "lunaris.public-runtime-config.v1";
const versionCacheKey = "lunaris.build-version";

export async function loadRuntimeConfig(options: {
  request: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): Promise<PublicRuntimeConfig> {
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
    let buildVersion: string | undefined;
    try {
      saved = options.storage?.getItem(cacheKey) ?? null;
      buildVersion = options.storage?.getItem(versionCacheKey) || undefined;
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
    setPublicRuntimeConfig(config, buildVersion);
    return config;
  }
  // Invalid online configuration must fail visibly, not silently use old settings.
  const config = publicRuntimeConfigSchema.parse(await response.json());
  if (!config.REGION_DIRECTORY_URL) {
    throw new Error("Runtime region directory is required");
  }
  const buildVersion = response.headers.get(buildVersionHeader) || undefined;
  setPublicRuntimeConfig(config, buildVersion);
  try {
    options.storage?.setItem(cacheKey, JSON.stringify(config));
    options.storage?.setItem(versionCacheKey, buildVersion ?? "");
  } catch {
    /* Offline caching is best effort. */
  }
  return config;
}
