import type {
  PluginDefinition,
  PluginIconSource,
  PluginManifest,
  PluginMetadata,
} from "@lunarisapp/plugin-sdk";
import {
  OFFICIAL_MARKETPLACE_ID,
  type ExtensionMarketplace,
} from "@lunarisapp/plugin-sdk/marketplace";
import { BlockGameIcon } from "@lunarisapp/ui/icons";
import {
  resolveEnabledWorkspaceExtensionIds,
  toWorkspaceExtensionInstallation,
  useWorkspaceExtensionsQuery,
} from "@repo/data/features/workspace-extensions";
import { useOrganizationExtensionRegistriesQuery } from "@repo/data/features/organization-extension-registries";
import { useAuth } from "@repo/features/auth/context";
import type { ExtensionAvailability } from "@repo/workspaces/extensions";
import { useOnlineStatus, usePlatform } from "@repo/platform";
import { OFFICIAL_EXTENSION_MARKETPLACE_URL } from "@repo/platform";
import { log, parseError } from "evlog";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cachePluginRelease,
  fetchPluginCatalog,
  loadExternalPluginDescriptor,
  loadExternalPluginIcon,
  loadExternalPlugin,
  readCachedPluginCatalog,
  type LoadedExternalPlugin,
} from "./external";
import {
  isLoadableExternalInstallation,
  resolveExternalInstallations,
} from "./external/installations";
import {
  ALL_PLUGIN_IDS,
  PLUGIN_MANIFESTS,
  PLUGIN_METADATA,
  loadPlugin as loadBundledPlugin,
  loadPlugins as loadBundledPlugins,
  type PluginLoadResult,
} from "./registry";

export interface AvailablePluginRegistry {
  allExtensionIds: readonly string[];
  bundledExtensionIds: readonly string[];
  defaultExtensionIds: readonly string[];
  enabledExtensionIds: readonly string[];
  extensionAvailability: Record<string, ExtensionAvailability>;
  extensionManifests: Record<string, PluginManifest>;
  extensionMetadata: Record<string, PluginMetadata>;
  key: string;
  loadPlugin: (id: string) => Promise<PluginLoadResult>;
  loadPlugins: (ids: string[]) => Promise<PluginDefinition[]>;
  refreshWorkspaceExtensions: () => Promise<void>;
  runtimeRevisions: Record<string, string>;
  unloadPlugin: (id: string, revision?: string) => void;
}

interface CatalogResolution {
  catalogs: Record<string, ExtensionMarketplace>;
  installationKey: string;
  signature: string;
}

interface ManifestResolution {
  fingerprints: Record<string, string>;
  icons: Record<string, PluginIconSource>;
  key: string;
  manifests: Record<string, PluginManifest>;
}

const EMPTY_CATALOG_RESOLUTION: CatalogResolution = {
  catalogs: {},
  installationKey: "",
  signature: "",
};

const EMPTY_MANIFEST_RESOLUTION: ManifestResolution = {
  fingerprints: {},
  icons: {},
  key: "",
  manifests: {},
};

function getReleaseFingerprint(
  manifest: PluginManifest,
  iconSha256: string | null,
): string {
  return JSON.stringify([manifest, iconSha256]);
}

function bytesToDataUrl(value: Uint8Array, resource: string): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return `data:${resource};base64,${btoa(binary)}`;
}

function releaseIcon(
  value: Uint8Array,
  resource: string,
): PluginIconSource {
  return createElement(
    "svg",
    { viewBox: "0 0 24 24" },
    createElement("image", {
      height: 24,
      href: bytesToDataUrl(value, resource),
      width: 24,
    }),
  );
}

function getCatalogSignature(
  catalogs: Record<string, ExtensionMarketplace>,
): string {
  return JSON.stringify(catalogs);
}

export function getAvailablePluginRegistry(): AvailablePluginRegistry {
  const allExtensionIds = ALL_PLUGIN_IDS;
  const extensionMetadata: Record<string, PluginMetadata> = {};
  for (const pluginId of allExtensionIds) {
    const metadata = PLUGIN_METADATA[pluginId];
    if (metadata) extensionMetadata[pluginId] = metadata;
  }

  return {
    allExtensionIds,
    bundledExtensionIds: allExtensionIds,
    defaultExtensionIds: allExtensionIds,
    enabledExtensionIds: allExtensionIds,
    key: allExtensionIds.join("|"),
    loadPlugin: loadBundledPlugin,
    loadPlugins: loadBundledPlugins,
    refreshWorkspaceExtensions: async () => undefined,
    extensionAvailability: Object.fromEntries(
      allExtensionIds.map((id) => [id, "available" as const]),
    ),
    extensionManifests: Object.fromEntries(
      allExtensionIds.flatMap((id) => {
        const manifest = PLUGIN_MANIFESTS[id];
        return manifest ? [[id, manifest]] : [];
      }),
    ),
    extensionMetadata,
    runtimeRevisions: Object.fromEntries(
      allExtensionIds.map((id) => [id, `bundled:${PLUGIN_MANIFESTS[id]?.version ?? "unknown"}`]),
    ),
    unloadPlugin: () => undefined,
  };
}

export function useAvailablePluginRegistry(
  workspaceId?: string,
): AvailablePluginRegistry & {
  pending: boolean;
} {
  const auth = useAuth();
  const platform = usePlatform();
  const online = useOnlineStatus();
  const { data: organization } = auth.useActiveOrganization();
  const installationRows = useWorkspaceExtensionsQuery(workspaceId ?? "");
  const installationData = useMemo(
    () =>
      (installationRows.data ?? []).flatMap((row) => {
        const installation = toWorkspaceExtensionInstallation(row);
        return installation ? [installation] : [];
      }),
    [installationRows.data],
  );
  const installations = { ...installationRows, data: installationData };
  const registries = useOrganizationExtensionRegistriesQuery(organization?.id);
  const [catalogResolution, setCatalogResolution] =
    useState<CatalogResolution>(EMPTY_CATALOG_RESOLUTION);

  const [manifestResolution, setManifestResolution] =
    useState<ManifestResolution>(EMPTY_MANIFEST_RESOLUTION);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [loadFailures, setLoadFailures] = useState<
    Record<string, ExtensionAvailability>
  >({});
  const loaded = useRef(new Map<string, LoadedExternalPlugin>());
  const loading = useRef(new Map<string, Promise<LoadedExternalPlugin>>());
  const mounted = useRef(false);
  const allowedExternalKeys = useRef(new Set<string>());
  const suppressedPluginIds = useRef(new Set<string>());
  const blockedExternalKeys = useRef(new Set<string>());
  const bundled = useMemo(() => getAvailablePluginRegistry(), []);
  const externalInstallationKey = useMemo(
    () =>
      (installations.data ?? [])
        .filter(
          (installation) =>
            !bundled.allExtensionIds.includes(installation.extensionId),
        )
        .map(
          (installation) =>
            `${installation.registryId}:${installation.extensionId}@${installation.version}:${installation.descriptorSha256 ?? "catalog"}`,
        )
        .join("|"),
    [bundled.allExtensionIds, installations.data],
  );
  const directoryPending = externalInstallationKey !== "" &&
    registries.isLoading === true && !registries.data?.length;
  const marketplaceUrlKey =
    (registries.data ?? []).map((registry) => registry.manifestUrl).join("|") ||
    OFFICIAL_EXTENSION_MARKETPLACE_URL;
  const marketplaceUrls = useMemo(
    () => marketplaceUrlKey.split("|"),
    [marketplaceUrlKey],
  );
  const catalogLoadKey = `${externalInstallationKey}::${marketplaceUrls.join("|")}`;
  const catalogPending =
    externalInstallationKey !== "" &&
    catalogResolution.installationKey !== catalogLoadKey;
  const catalogs =
    catalogResolution.installationKey === catalogLoadKey
      ? catalogResolution.catalogs
      : {};

  useEffect(() => {
    if (!externalInstallationKey || directoryPending) {
      setCatalogResolution(EMPTY_CATALOG_RESOLUTION);
      return;
    }
    let cancelled = false;
    const applyCatalog = (value: Record<string, ExtensionMarketplace>) => {
      const signature = getCatalogSignature(value);
      setCatalogResolution((current) =>
        current.installationKey === catalogLoadKey &&
        current.signature === signature
          ? current
          : {
              catalogs: value,
              installationKey: catalogLoadKey,
              signature,
            },
      );
    };
    const refresh = () => {
      if (!platform.network.isOnline()) return;
      void Promise.all(
        marketplaceUrls.map(async (url) => {
          try {
            return [url, await fetchPluginCatalog(platform.plugins, url)] as const;
          } catch (error) {
            log.warn({
              action: "plugin.marketplace.load",
              outcome: "failure",
              error: parseError(error),
            });
            return [url, await readCachedPluginCatalog(platform.plugins, url)] as const;
          }
        }),
      )
        .then((results) => {
          if (cancelled) return;
          applyCatalog(
            Object.fromEntries(
              results.flatMap(([url, value]) => (value ? [[url, value]] : [])),
            ),
          );
          setCatalogRefresh((value) => value + 1);
        })
        .catch((error) => {
          if (!cancelled) {
            setCatalogResolution((current) =>
              current.installationKey === catalogLoadKey
                ? current
                : {
                    catalogs: {},
                    installationKey: catalogLoadKey,
                    signature: "",
                  },
            );
            log.warn({
              action: "plugin.catalog.load",
              outcome: "failure",
              error: parseError(error),
            });
          }
        });
    };
    void Promise.all(
      marketplaceUrls.map(async (url) => [
        url,
        await readCachedPluginCatalog(platform.plugins, url),
      ] as const),
    ).then((cached) => {
      if (cancelled) return;
      applyCatalog(
        Object.fromEntries(
          cached.flatMap(([url, value]) => (value ? [[url, value]] : [])),
        ),
      );
      refresh();
    });
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    const unsubscribe = platform.network.subscribeOnline(refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [catalogLoadKey, directoryPending, externalInstallationKey, marketplaceUrls, platform.network, platform.plugins]);

  const catalogByRegistryId = useMemo<Record<string, ExtensionMarketplace | null>>(
    () => ({
      [OFFICIAL_MARKETPLACE_ID]:
        catalogs[OFFICIAL_EXTENSION_MARKETPLACE_URL] ?? null,
      ...Object.fromEntries(
        (registries.data ?? []).map((registry) => [
          registry.id,
          catalogs[registry.manifestUrl] ?? null,
        ]),
      ),
    }),
    [catalogs, registries.data],
  );
  const external = useMemo(
    () => directoryPending ? [] :
      (installations.data ?? []).flatMap((installation) =>
        resolveExternalInstallations({
          bundledPluginIds: bundled.allExtensionIds,
          catalog: catalogByRegistryId[installation.registryId] ?? null,
          installations: [installation],
          online,
        }),
      ),
    [
      bundled.allExtensionIds,
      directoryPending,
      catalogByRegistryId,
      installations.data,
      online,
    ],
  );

  const activeExternal = useMemo(
    () => external.filter(isLoadableExternalInstallation),
    [external],
  );

  const externalManifestKey = useMemo(
    () =>
      activeExternal
        .map(
          ({ installation, version }) =>
            `${installation.extensionId}@${installation.version}:${version.descriptor.sha256}`,
        )
        .join("|"),
    [activeExternal],
  );
  const externalManifestsPending =
    externalManifestKey !== "" && manifestResolution.key !== externalManifestKey;

  useEffect(() => {
    if (!externalManifestKey) {
      setManifestResolution(EMPTY_MANIFEST_RESOLUTION);
      return;
    }
    let cancelled = false;
    void Promise.all(
      activeExternal.map(async ({ entry, installation, version }) => {
        const cacheKey = `${entry.id}@${installation.version}`;
        try {
          const descriptor = await loadExternalPluginDescriptor(
            {
              descriptor: version.descriptor,
              id: entry.id,
              version: installation.version,
            },
            platform.plugins,
            { allowNetwork: online },
          );
          if (descriptor.status !== "active") {
            blockedExternalKeys.current.add(cacheKey);
            if (!cancelled) {
              setLoadFailures((current) => ({
                ...current,
                [cacheKey]: "blocked",
              }));
            }
            return null;
          }
          blockedExternalKeys.current.delete(cacheKey);
          const icon = descriptor.icon
            ? await loadExternalPluginIcon(descriptor, platform.plugins).catch(
                () => null,
              )
            : null;
          return {
            fingerprint: getReleaseFingerprint(
              descriptor.manifest,
              icon ? descriptor.icon?.sha256 ?? null : null,
            ),
            icon: icon
              ? releaseIcon(icon, descriptor.icon?.resource ?? "image/png")
              : null,
            id: entry.id,
            manifest: descriptor.manifest,
          };
        } catch {
          if (!cancelled && !online) {
            setLoadFailures((current) => ({
              ...current,
              [cacheKey]: "missing-offline-cache",
            }));
          }
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setManifestResolution({
        fingerprints: Object.fromEntries(
          entries.filter(
            (entry): entry is NonNullable<typeof entry> => entry !== null,
          ).map((entry) => [entry.id, entry.fingerprint]),
        ),
        key: externalManifestKey,
        manifests: Object.fromEntries(
          entries.filter(
            (entry): entry is NonNullable<typeof entry> => entry !== null,
          ).map((entry) => [entry.id, entry.manifest]),
        ),
        icons: Object.fromEntries(
          entries.flatMap((entry) =>
            entry?.icon ? [[entry.id, entry.icon]] : [],
          ),
        ),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeExternal, externalManifestKey, online, platform.plugins]);

  const externalById = useMemo(
    () =>
      new Map(
        activeExternal.map((item) => [item.installation.extensionId, item]),
      ),
    [activeExternal],
  );
  const installedExternalById = useMemo(
    () =>
      new Map(external.map((item) => [item.installation.extensionId, item])),
    [external],
  );
  const allowed = useMemo(
    () =>
      new Set(
        activeExternal.map(
          ({ installation }) =>
            `${installation.extensionId}@${installation.registryId}:${installation.version}:${installation.descriptorSha256 ?? "catalog"}`,
        ),
      ),
    [activeExternal],
  );
  allowedExternalKeys.current = allowed;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const plugin of loaded.current.values()) plugin.dispose();
      loaded.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    for (const { entry, installation, version } of activeExternal) {
      const cacheKey = `${entry.id}@${installation.version}`;
      void cachePluginRelease(
        {
          descriptor: version.descriptor,
          id: entry.id,
          version: installation.version,
        },
        platform.plugins,
      )
        .then((descriptor) => {
          if (descriptor.status !== "active") {
            blockedExternalKeys.current.add(cacheKey);
            suppressedPluginIds.current.add(entry.id);
            setManifestResolution((resolution) => {
              if (resolution.key !== externalManifestKey) return resolution;
              if (
                !(entry.id in resolution.fingerprints) &&
                !(entry.id in resolution.manifests) &&
                !(entry.id in resolution.icons)
              ) {
                return resolution;
              }
              const fingerprints = { ...resolution.fingerprints };
              const manifests = { ...resolution.manifests };
              const icons = { ...resolution.icons };
              delete fingerprints[entry.id];
              delete manifests[entry.id];
              delete icons[entry.id];
              return { ...resolution, fingerprints, icons, manifests };
            });
            setLoadFailures((current) =>
              current[cacheKey] === "blocked"
                ? current
                : { ...current, [cacheKey]: "blocked" },
            );
            return;
          }
          blockedExternalKeys.current.delete(cacheKey);
          suppressedPluginIds.current.delete(entry.id);
          void loadExternalPluginIcon(descriptor, platform.plugins)
            .catch(() => null)
            .then((icon) => {
              const fingerprint = getReleaseFingerprint(
                descriptor.manifest,
                icon ? descriptor.icon?.sha256 ?? null : null,
              );
              setManifestResolution((resolution) => {
                if (
                  resolution.key !== externalManifestKey ||
                  resolution.fingerprints[entry.id] === fingerprint
                ) {
                  return resolution;
                }
                return {
                  ...resolution,
                  fingerprints: {
                    ...resolution.fingerprints,
                    [entry.id]: fingerprint,
                  },
                  icons: icon
                    ? {
                        ...resolution.icons,
                        [entry.id]: releaseIcon(
                          icon,
                          descriptor.icon?.resource ?? "image/png",
                        ),
                      }
                    : resolution.icons,
                  manifests: {
                    ...resolution.manifests,
                    [entry.id]: descriptor.manifest,
                  },
                };
              });
            });
          setLoadFailures((current) => {
            if (
              current[cacheKey] !== "missing-offline-cache" &&
              current[cacheKey] !== "corrupt-artifact" &&
              current[cacheKey] !== "blocked"
            ) {
              return current;
            }
            const next = { ...current };
            delete next[cacheKey];
            return next;
          });
        })
        .catch(() => undefined);
    }
  }, [activeExternal, catalogRefresh, externalManifestKey, online, platform.plugins]);
  const loadPlugin = useCallback(
    async (id: string): Promise<PluginLoadResult> => {
      const reference = externalById.get(id);
      if (!reference) {
        const unavailable = installedExternalById.get(id);
        return unavailable
          ? {
              id,
              error: new Error(
                `Extension "${id}" is unavailable (${unavailable.availability})`,
              ),
            }
          : loadBundledPlugin(id);
      }
      const cacheKey = `${id}@${reference.installation.version}`;
      const runtimeRevision = `${reference.installation.registryId}:${reference.installation.version}:${reference.installation.descriptorSha256 ?? "catalog"}`;
      const runtimeKey = `${id}@${runtimeRevision}`;
      if (blockedExternalKeys.current.has(cacheKey)) {
        return {
          id,
          error: new Error(`Extension "${id}" version is blocked`),
        };
      }
      suppressedPluginIds.current.delete(id);
      const cached = loaded.current.get(runtimeKey);
      if (cached) return { id, plugin: cached.plugin };
      try {
        let request = loading.current.get(runtimeKey);
        if (!request) {
          request = loadExternalPlugin(
            {
              descriptor: reference.version.descriptor,
              id,
              version: reference.installation.version,
            },
            platform.plugins,
            { allowNetwork: online },
          );
          loading.current.set(runtimeKey, request);
        }
        const result = await request.finally(() => {
          if (loading.current.get(runtimeKey) === request) {
            loading.current.delete(runtimeKey);
          }
        });
        if (
          !mounted.current ||
          !allowedExternalKeys.current.has(runtimeKey) ||
          suppressedPluginIds.current.has(id)
        ) {
          result.dispose();
          throw new Error(`Extension "${id}" is no longer enabled`);
        }
        const current = loaded.current.get(runtimeKey);
        if (current === result) return { id, plugin: result.plugin };
        loaded.current.set(runtimeKey, result);
        setLoadFailures((current) => {
          if (!current[cacheKey]) return current;
          const next = { ...current };
          delete next[cacheKey];
          return next;
        });
        return { id, plugin: result.plugin };
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        if (!mounted.current) return { id, error: normalized };
        if (
          !allowedExternalKeys.current.has(runtimeKey) ||
          suppressedPluginIds.current.has(id)
        ) {
          return { id, error: normalized };
        }
        log.error({
          action: "plugin.load",
          outcome: "failure",
          plugin: { id, version: reference.installation.version },
          error: parseError(normalized),
        });
        setLoadFailures((current) => ({
          ...current,
          [cacheKey]: /checksum|corrupt|size does not match/i.test(
            normalized.message,
          )
            ? "corrupt-artifact"
            : !online
              ? "missing-offline-cache"
              : "load-failure",
        }));
        return { id, error: normalized };
      }
    },
    [externalById, installedExternalById, online, platform.plugins],
  );
  const loadPlugins = useCallback(
    async (ids: string[]) => {
      const results = await Promise.all(ids.map(loadPlugin));
      return results.flatMap(({ plugin }) => (plugin ? [plugin] : []));
    },
    [loadPlugin],
  );
  const unloadPlugin = useCallback((id: string, revision?: string) => {
    suppressedPluginIds.current.add(id);
    for (const [key, plugin] of loaded.current) {
      if (!key.startsWith(`${id}@`)) continue;
      if (revision && key !== `${id}@${revision}`) continue;
      plugin.dispose();
      loaded.current.delete(key);
    }
  }, []);

  const extensionMetadata = useMemo(() => {
    const value = { ...bundled.extensionMetadata };
    for (const { entry, installation } of external) {
      value[installation.extensionId] = {
        description: entry?.description ?? "Workspace extension release unavailable",
        developer: entry?.developer ?? "Unknown developer",
        icon:
          manifestResolution.key === externalManifestKey
            ? manifestResolution.icons[installation.extensionId] ?? BlockGameIcon
            : BlockGameIcon,
        iconUrl: entry?.iconUrl,
        id: installation.extensionId,
        name: entry?.name ?? installation.extensionId,
        version: installation.version,
      };
    }
    return value;
  }, [
    bundled.extensionMetadata,
    external,
    externalManifestKey,
    manifestResolution,
  ]);
  const extensionManifests = useMemo(
    () => ({
      ...bundled.extensionManifests,
      ...(manifestResolution.key === externalManifestKey
        ? manifestResolution.manifests
        : {}),
    }),
    [bundled.extensionManifests, externalManifestKey, manifestResolution],
  );
  const allExtensionIds = useMemo(
    () => [
      ...bundled.allExtensionIds,
      ...external.map(({ installation }) => installation.extensionId),
    ],
    [bundled.allExtensionIds, external],
  );
  const defaultExtensionIds = bundled.defaultExtensionIds;
  const extensionAvailability = useMemo(
    () => ({
      ...bundled.extensionAvailability,
      ...Object.fromEntries(
        external.map((item) => [
          item.installation.extensionId,
          loadFailures[
            `${item.installation.extensionId}@${item.installation.version}`
          ] ?? item.availability,
        ]),
      ),
    }),
    [bundled.extensionAvailability, external, loadFailures],
  );
  const enabledExtensionIds = useMemo(() => {
    if (!workspaceId) return bundled.enabledExtensionIds;
    const enabled = resolveEnabledWorkspaceExtensionIds(
      installationRows.data ?? [],
      bundled.defaultExtensionIds,
    );
    return allExtensionIds.filter((id) => enabled.has(id));
  }, [allExtensionIds, bundled.defaultExtensionIds, bundled.enabledExtensionIds, installationRows.data, workspaceId]);
  const runtimeRevisions = useMemo(() => {
    const revisions = { ...bundled.runtimeRevisions };
    for (const { installation } of external) {
      revisions[installation.extensionId] = `${installation.registryId}:${installation.version}:${installation.descriptorSha256 ?? "catalog"}`;
    }
    return revisions;
  }, [bundled.runtimeRevisions, external]);
  const refreshWorkspaceExtensions = useCallback(async () => {
    await installationRows.refresh?.();
  }, [installationRows.refresh]);

  return {
    allExtensionIds,
    bundledExtensionIds: bundled.allExtensionIds,
    defaultExtensionIds,
    enabledExtensionIds,
    key: allExtensionIds
      .map(
        (id) =>
          `${id}@${extensionMetadata[id]?.version}:${extensionAvailability[id]}`,
      )
      .join("|"),
    loadPlugin,
    loadPlugins,
    pending:
      (Boolean(workspaceId) && installations.isLoading) ||
      directoryPending ||
      catalogPending ||
      externalManifestsPending,
    extensionAvailability,
    extensionManifests,
    extensionMetadata,
    refreshWorkspaceExtensions,
    runtimeRevisions,
    unloadPlugin,
  };
}
