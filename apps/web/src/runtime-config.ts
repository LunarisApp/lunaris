import {
  publicRuntimeConfigSchema,
  setPublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "@repo/app-shell/runtime-config";

const cacheKey = "lunaris.public-runtime-config.v1";

export async function loadRuntimeConfig(options: {
  request: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): Promise<PublicRuntimeConfig> {
  let response: Response;
  try {
    response = await options.request("/runtime-config.json", {
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
    setPublicRuntimeConfig(config);
    return config;
  }
  // Invalid online configuration must fail visibly, not silently use old settings.
  const config = publicRuntimeConfigSchema.parse(await response.json());
  if (!config.REGION_DIRECTORY_URL) {
    throw new Error("Runtime region directory is required");
  }
  setPublicRuntimeConfig(config);
  try {
    options.storage?.setItem(cacheKey, JSON.stringify(config));
  } catch {
    /* Offline caching is best effort. */
  }
  return config;
}
