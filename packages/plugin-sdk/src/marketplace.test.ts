import { describe, expect, it } from "vitest";
import {
  isMarketplaceVersionCompatible,
  normalizeMarketplaceSource,
  parseExtensionMarketplace,
  parsePluginReleaseDescriptor,
} from "./marketplace";

const manifest = {
  api: "^0.7.0",
  description: "A calendar",
  developer: "Example",
  id: "example.calendar",
  name: "Calendar",
  permissions: [],
  version: "1.0.0",
};

const version = {
  api: "^0.7.0",
  descriptor: {
    bytes: 1024,
    sha256: "b".repeat(64),
    url: "./releases/example.calendar/1.0.0.json",
  },
  packageSizeBytes: 2048,
  runtime: { kind: "iframe" as const, protocol: 6 as const },
  status: "active" as const,
  version: "1.0.0",
};

function marketplace(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Example extensions",
    enabled: true,
    extensions: [
      {
        description: manifest.description,
        developer: manifest.developer,
        id: manifest.id,
        latestVersion: manifest.version,
        name: manifest.name,
        repository: "https://github.com/example/calendar",
        versions: [version],
      },
    ],
    generatedAt: "2026-08-07T00:00:00.000Z",
    name: "example-extensions",
    schemaVersion: 1,
    ...overrides,
  };
}

describe("extension marketplace", () => {
  it("normalizes GitHub and generic HTTPS sources", () => {
    expect(
      normalizeMarketplaceSource("https://github.com/Example/extensions.git/"),
    ).toEqual({
      kind: "github",
      location: "https://github.com/Example/extensions",
      manifestUrl:
        "https://raw.githubusercontent.com/Example/extensions/HEAD/marketplace.json",
    });
    expect(
      normalizeMarketplaceSource("https://extensions.example.com/marketplace.json"),
    ).toEqual({
      kind: "https",
      location: "https://extensions.example.com/marketplace.json",
      manifestUrl: "https://extensions.example.com/marketplace.json",
    });
  });

  it("rejects unsafe or ambiguous marketplace sources", () => {
    expect(() => normalizeMarketplaceSource("http://example.com/marketplace.json")).toThrow(
      "must use HTTPS",
    );
    expect(() => normalizeMarketplaceSource("https://user@example.com/marketplace.json")).toThrow(
      "must not include credentials",
    );
    expect(() => normalizeMarketplaceSource("https://github.com/example/repo/tree/main")).toThrow(
      "one repository",
    );
  });

  it("resolves relative descriptor URLs and checks compatibility", () => {
    const parsed = parseExtensionMarketplace(
      marketplace(),
      "https://cdn.example.com/marketplace.json",
    );

    expect(parsed.extensions[0]?.versions[0]?.descriptor.url).toBe(
      "https://cdn.example.com/releases/example.calendar/1.0.0.json",
    );
    expect(isMarketplaceVersionCompatible("0.7.0", version)).toBe(true);
    expect(isMarketplaceVersionCompatible("0.6.0", version)).toBe(false);
    expect(isMarketplaceVersionCompatible("0.5.0", version)).toBe(false);
  });

  it("retains historical protocol releases but marks them incompatible", () => {
    const historicalVersion = {
      ...version,
      runtime: { kind: "iframe" as const, protocol: 5 },
    };
    const historicalMarketplace = marketplace({
      extensions: [
        {
          ...marketplace().extensions[0],
          versions: [historicalVersion],
        },
      ],
    });

    const parsed = parseExtensionMarketplace(
      historicalMarketplace,
      "https://cdn.example.com/marketplace.json",
    );

    expect(parsed.extensions[0]?.versions[0]?.runtime.protocol).toBe(5);
    expect(isMarketplaceVersionCompatible("0.8.0", historicalVersion)).toBe(
      false,
    );
  });

  it("rejects duplicate extension IDs and versions", () => {
    const entry = marketplace().extensions[0];
    expect(() =>
      parseExtensionMarketplace(
        marketplace({ extensions: [entry, entry] }),
        "https://cdn.example.com/marketplace.json",
      ),
    ).toThrow("Duplicate extension ID");
    expect(() =>
      parseExtensionMarketplace(
        marketplace({
          extensions: [{ ...entry, versions: [version, version] }],
        }),
        "https://cdn.example.com/marketplace.json",
      ),
    ).toThrow("Duplicate extension version");
  });

  it("rejects non-HTTPS descriptor URLs", () => {
    const entry = marketplace().extensions[0];
    expect(() =>
      parseExtensionMarketplace(
        marketplace({
          extensions: [
            {
              ...entry,
              versions: [
                {
                  ...version,
                  descriptor: { ...version.descriptor, url: "http://example.com/release.json" },
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow("must use HTTPS");
  });

  it("rejects descriptor identity mismatches", () => {
    expect(() =>
      parsePluginReleaseDescriptor(
        {
          api: manifest.api,
          manifest,
          repository: "https://github.com/example/calendar",
          runtime: { kind: "iframe", protocol: 6 },
          script: {
            bytes: 1,
            resource: "text/javascript",
            sha256: "a".repeat(64),
            url: "https://cdn.example.com/main.js",
          },
          status: "active",
        },
        { id: "other.plugin", version: "1.0.0" },
      ),
    ).toThrow("does not match");
  });

  it("resolves release assets relative to the descriptor", () => {
    const descriptorUrl =
      "https://raw.githubusercontent.com/example/extensions/abc123/artifacts/example.calendar/1.0.0/release.json";
    const parsed = parsePluginReleaseDescriptor(
      {
        api: manifest.api,
        icon: {
          bytes: 1,
          resource: "image/png",
          sha256: "b".repeat(64),
          url: "./icon.png",
        },
        manifest,
        repository: "https://github.com/example/extensions",
        runtime: { kind: "iframe", protocol: 6 },
        script: {
          bytes: 1,
          resource: "text/javascript",
          sha256: "a".repeat(64),
          url: "./main.js",
        },
        status: "active",
      },
      { id: manifest.id, version: manifest.version },
      descriptorUrl,
    );

    expect(parsed.script.url).toBe(
      "https://raw.githubusercontent.com/example/extensions/abc123/artifacts/example.calendar/1.0.0/main.js",
    );
    expect(parsed.icon?.url).toBe(
      "https://raw.githubusercontent.com/example/extensions/abc123/artifacts/example.calendar/1.0.0/icon.png",
    );
  });

  it("rejects release assets that do not resolve to HTTPS", () => {
    expect(() =>
      parsePluginReleaseDescriptor(
        {
          api: manifest.api,
          manifest,
          repository: "https://github.com/example/extensions",
          runtime: { kind: "iframe", protocol: 6 },
          script: {
            bytes: 1,
            resource: "text/javascript",
            sha256: "a".repeat(64),
            url: "http://example.com/main.js",
          },
          status: "active",
        },
        { id: manifest.id, version: manifest.version },
        "https://cdn.example.com/release.json",
      ),
    ).toThrow("asset URL must use HTTPS");
  });
});
