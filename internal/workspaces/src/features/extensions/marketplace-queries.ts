import {
  parseExtensionMarketplace,
  type ExtensionMarketplace,
} from "@lunarisapp/plugin-sdk/marketplace";
import {
  fetchAndCacheJson,
  readCachedJson,
  type PlatformPlugins,
} from "@repo/platform";

const STALE_TIME_MS = 30_000;

export interface ExtensionMarketplaceQueryResult {
  catalog: ExtensionMarketplace;
  source: "cache" | "network";
}

export function extensionMarketplaceQueryOptions(
  plugins: PlatformPlugins,
  manifestUrl: string,
) {
  return {
    networkMode: "always" as const,
    queryFn: async (): Promise<ExtensionMarketplaceQueryResult> => {
      const parse = (value: unknown) =>
        parseExtensionMarketplace(value, manifestUrl);
      try {
        return {
          catalog: await fetchAndCacheJson(manifestUrl, plugins, parse),
          source: "network",
        };
      } catch (error) {
        const cached = await readCachedJson(manifestUrl, plugins, parse);
        if (cached) return { catalog: cached, source: "cache" };
        throw error;
      }
    },
    queryKey: ["extensions", "marketplace", manifestUrl] as const,
    staleTime: STALE_TIME_MS,
  };
}
