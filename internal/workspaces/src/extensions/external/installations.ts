import {
  PLUGIN_API_SUPPORTED_VERSIONS,
  PLUGIN_SANDBOX_RUNTIME,
} from "@lunarisapp/plugin-sdk";
import {
  isMarketplaceVersionCompatible,
  type ExtensionMarketplace,
  type ExtensionMarketplaceEntry,
  type ExtensionMarketplaceVersion,
} from "@lunarisapp/plugin-sdk/marketplace";
import type { WorkspaceExtensionInstallation } from "@repo/data/features/workspace-extensions";
import type { ExtensionAvailability } from "@repo/workspaces/extensions";

export interface ExternalInstallation {
  availability: ExtensionAvailability;
  entry?: ExtensionMarketplaceEntry;
  installation: WorkspaceExtensionInstallation;
  version?: ExtensionMarketplaceVersion;
}

export type LoadableExternalInstallation = ExternalInstallation & {
  entry: ExtensionMarketplaceEntry;
  version: ExtensionMarketplaceVersion;
};

export function isLoadableExternalInstallation(
  value: ExternalInstallation
): value is LoadableExternalInstallation {
  return (
    value.availability === "available" &&
    Boolean(value.entry) &&
    Boolean(value.version)
  );
}

export function resolveExternalInstallations({
  bundledPluginIds,
  catalog,
  installations,
  online,
}: {
  bundledPluginIds: readonly string[];
  catalog: ExtensionMarketplace | null;
  installations: readonly WorkspaceExtensionInstallation[];
  online: boolean;
}): ExternalInstallation[] {
  const catalogById = new Map(
    catalog?.extensions.map((entry) => [entry.id, entry])
  );

  return installations.flatMap((installation) => {
    if (bundledPluginIds.includes(installation.extensionId)) {
      return [];
    }
    const listedEntry = catalogById.get(installation.extensionId);
    const listedVersion = listedEntry?.versions.find(
      (candidate) => candidate.version === installation.version
    );
    const pinned =
      installation.descriptorUrl &&
      installation.descriptorBytes !== null &&
      installation.descriptorSha256
        ? {
            api: listedVersion?.api ?? "*",
            descriptor: {
              bytes: installation.descriptorBytes,
              sha256: installation.descriptorSha256,
              url: installation.descriptorUrl,
            },
            runtime: listedVersion?.runtime ?? PLUGIN_SANDBOX_RUNTIME,
            status: listedVersion?.status ?? ("active" as const),
            version: installation.version,
          }
        : undefined;
    const version = online
      ? listedVersion && pinned
        ? pinned
        : listedVersion
      : (pinned ?? listedVersion);
    const entry =
      listedEntry ??
      (!online && pinned
        ? {
            description: installation.extensionId,
            developer: "Unknown publisher",
            id: installation.extensionId,
            latestVersion: installation.version,
            name: installation.extensionId,
            repository: "https://example.invalid",
            versions: [pinned],
          }
        : undefined);

    let availability: ExtensionAvailability = "available";
    if (!(catalog || pinned)) {
      availability = online ? "unknown-release" : "missing-offline-cache";
    } else if (catalog && !catalog.enabled) {
      availability = "catalog-disabled";
    } else if (!(entry && version)) {
      availability = "unknown-release";
    } else if (
      !isMarketplaceVersionCompatible(PLUGIN_API_SUPPORTED_VERSIONS, version)
    ) {
      availability = version.status === "blocked" ? "blocked" : "incompatible";
    }

    return [{ availability, entry, installation, version }];
  });
}
