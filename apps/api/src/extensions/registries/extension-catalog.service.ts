import { ServiceUnavailableException } from "@nestjs/common";
import {
  isMarketplaceVersionCompatible,
  OFFICIAL_MARKETPLACE_MANIFEST_URL,
  parseExtensionMarketplace,
  type ExtensionMarketplace,
  type ExtensionMarketplaceVersion,
} from "@lunarisapp/plugin-sdk/marketplace";
import { PLUGIN_API_SUPPORTED_VERSIONS } from "@lunarisapp/plugin-sdk";
import { fetchMarketplaceJson } from "./marketplace-http";

const CACHE_TTL_MS = 5 * 60 * 1000;

export class ExtensionCatalogService {
  private readonly cache = new Map<
    string,
    { catalog: ExtensionMarketplace; expiresAt: number }
  >();

  constructor(
    private readonly fetchJson: typeof fetchMarketplaceJson = fetchMarketplaceJson
  ) {}

  async requireActiveVersion(
    manifestUrl: string,
    pluginId: string,
    version: string
  ): Promise<ExtensionMarketplaceVersion> {
    const catalog = await this.getCatalog(manifestUrl);
    if (!catalog.enabled) {
      throw new ServiceUnavailableException("External extensions are disabled");
    }
    const plugin = catalog.extensions.find((entry) => entry.id === pluginId);
    const release = plugin?.versions.find((entry) => entry.version === version);
    if (
      !(
        release &&
        isMarketplaceVersionCompatible(PLUGIN_API_SUPPORTED_VERSIONS, release)
      )
    ) {
      throw new ServiceUnavailableException("Extension version is unavailable");
    }
    return release;
  }

  async getCatalog(manifestUrl: string): Promise<ExtensionMarketplace> {
    const configuredOfficialUrl = process.env.PLUGIN_MARKETPLACE_URL;
    const resolvedUrl =
      manifestUrl === OFFICIAL_MARKETPLACE_MANIFEST_URL && configuredOfficialUrl
        ? configuredOfficialUrl
        : manifestUrl;
    const usesConfiguredOfficialUrl = resolvedUrl !== manifestUrl;
    const cached = this.cache.get(resolvedUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.catalog;
    }

    let value: unknown;
    try {
      value = await this.fetchJson(resolvedUrl, {
        allowPrivate: usesConfiguredOfficialUrl,
      });
    } catch (cause) {
      throw new ServiceUnavailableException(
        "Extension catalog is unavailable",
        {
          cause,
        }
      );
    }

    let catalog: ExtensionMarketplace;
    try {
      catalog = parseExtensionMarketplace(value, resolvedUrl);
    } catch (cause) {
      throw new ServiceUnavailableException(
        "Extension marketplace is invalid",
        {
          cause,
        }
      );
    }
    this.cache.set(resolvedUrl, {
      catalog,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return catalog;
  }
}

export const extensionCatalogService = new ExtensionCatalogService();
