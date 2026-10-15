import type { ExtensionMarketplace } from "@lunarisapp/plugin-sdk/marketplace";
import type { WorkspaceExtensionInstallation } from "@repo/data/features/workspace-extensions";
import { describe, expect, it } from "vitest";
import { resolveExternalInstallations } from "./installations";

const installation: WorkspaceExtensionInstallation = {
  descriptorBytes: null,
  descriptorSha256: null,
  descriptorUrl: null,
  enabled: true,
  extensionId: "example.plugin",
  registryId: "lunaris-official",
  version: "1.0.0",
};

function catalog(
  status: "active" | "blocked" = "active",
  api = "^0.9.0",
): ExtensionMarketplace {
  return {
    displayName: "Example",
    enabled: true,
    generatedAt: "2026-08-08T00:00:00.000Z",
    extensions: [
      {
        description: "Example",
        developer: "Example",
        id: "example.plugin",
        latestVersion: "1.0.0",
        name: "Example",
        repository: "https://github.com/example/plugin",
        versions: [
          {
            descriptor: {
              bytes: 123,
              sha256: "a".repeat(64),
              url: "https://plugins.example/release.json",
            },
            runtime: { kind: "iframe", protocol: 6 },
            api,
            status,
            version: "1.0.0",
          },
        ],
      },
    ],
    name: "example",
    schemaVersion: 1,
  };
}

describe("resolveExternalInstallations", () => {
  it.each([
    [catalog(), true, "available"],
    [catalog("active", "^0.0.4"), true, "incompatible"],
    [catalog("blocked"), true, "blocked"],
    [catalog("active", "^2.0.0"), true, "incompatible"],
    [{ ...catalog(), enabled: false }, true, "catalog-disabled"],
    [null, false, "missing-offline-cache"],
  ] as const)("resolves catalog state", (pluginCatalog, online, expected) => {
    expect(
      resolveExternalInstallations({
        bundledPluginIds: [],
        catalog: pluginCatalog,
        installations: [installation],
        online,
      })[0]?.availability,
    ).toBe(expected);
  });

  it("uses pinned provenance offline but requires the release online", () => {
    const pinned = {
      ...installation,
      descriptorBytes: 123,
      descriptorSha256: "a".repeat(64),
      descriptorUrl: "https://plugins.example/release.json",
    };

    expect(
      resolveExternalInstallations({
        bundledPluginIds: [],
        catalog: null,
        installations: [pinned],
        online: false,
      })[0]?.availability,
    ).toBe("available");
    expect(
      resolveExternalInstallations({
        bundledPluginIds: [],
        catalog: null,
        installations: [pinned],
        online: true,
      })[0]?.availability,
    ).toBe("unknown-release");
  });
});
