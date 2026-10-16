import { satisfies, valid } from "semver";
import {
  array,
  boolean,
  enum as zEnum,
  iso,
  literal,
  number,
  object,
  string,
  unknown,
  url,
} from "zod";
import { type PluginManifest, validateManifest } from "./manifest";
import {
  isSupportedSandboxProtocol,
  type PluginSandboxRuntimeRequirement,
} from "./sandbox-protocol";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_MARKETPLACE_EXTENSIONS = 500;
const MAX_MARKETPLACE_VERSIONS = 100;
const GITHUB_HOST = "github.com";

export const OFFICIAL_MARKETPLACE_ID = "lunaris-official";
export const OFFICIAL_MARKETPLACE_LOCATION =
  "https://github.com/LunarisApp/extensions";
export const OFFICIAL_MARKETPLACE_MANIFEST_URL =
  "https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json";

export type MarketplaceSourceKind = "github" | "https";

export type MarketplaceSourceInput =
  | { kind: "github"; repositoryUrl: string }
  | { kind: "https"; manifestUrl: string };

export interface NormalizedMarketplaceSource {
  kind: MarketplaceSourceKind;
  location: string;
  manifestUrl: string;
}

function usesHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parsePublicHttpsUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Marketplace source must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Marketplace source must use HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Marketplace source must not include credentials");
  }
  if (parsed.hash) {
    throw new Error("Marketplace source must not include a fragment");
  }
  return parsed;
}

export function normalizeMarketplaceSource(
  input: MarketplaceSourceInput | string
): NormalizedMarketplaceSource {
  const candidate =
    typeof input === "string"
      ? parsePublicHttpsUrl(input)
      : parsePublicHttpsUrl(
          input.kind === "github" ? input.repositoryUrl : input.manifestUrl
        );

  const requestedKind = typeof input === "string" ? undefined : input.kind;
  if (candidate.hostname.toLowerCase() === GITHUB_HOST) {
    if (requestedKind === "https") {
      return {
        kind: "https",
        location: candidate.href,
        manifestUrl: candidate.href,
      };
    }
    if (candidate.search) {
      throw new Error("GitHub marketplace URL must not include a query");
    }
    const segments = candidate.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    if (segments.length !== 2) {
      throw new Error("GitHub marketplace URL must identify one repository");
    }
    const owner = segments[0];
    const repository = segments[1]?.replace(/\.git$/, "");
    if (
      !(
        owner &&
        repository &&
        /^[A-Za-z0-9_.-]+$/.test(owner) &&
        /^[A-Za-z0-9_.-]+$/.test(repository)
      )
    ) {
      throw new Error("GitHub marketplace URL contains an invalid repository");
    }
    const location = `https://github.com/${owner}/${repository}`;
    return {
      kind: "github",
      location,
      manifestUrl: `https://raw.githubusercontent.com/${owner}/${repository}/HEAD/marketplace.json`,
    };
  }

  if (requestedKind === "github") {
    throw new Error("GitHub marketplace source must use github.com");
  }
  return {
    kind: "https",
    location: candidate.href,
    manifestUrl: candidate.href,
  };
}

const httpsUrlSchema = url().max(2048).refine(usesHttps, "URL must use HTTPS");

const descriptorUrlSchema = string().min(1).max(2048);

export type PluginReleaseStatus = "active" | "blocked";

export interface PluginAsset {
  bytes: number;
  resource: string;
  sha256: string;
  url: string;
}

export interface PluginReleaseDescriptor {
  api: string;
  icon?: PluginAsset;
  manifest: PluginManifest;
  repository: string;
  runtime: PluginSandboxRuntimeRequirement;
  script: PluginAsset;
  status: PluginReleaseStatus;
  style?: PluginAsset;
}

export interface MarketplaceDescriptorReference {
  bytes: number;
  sha256: string;
  url: string;
}

/** Runtime metadata read from a marketplace, including historical protocols. */
export interface MarketplaceRuntimeRequirement {
  kind: "iframe";
  protocol: number;
}

export interface ExtensionMarketplaceVersion {
  api: string;
  descriptor: MarketplaceDescriptorReference;
  packageSizeBytes?: number;
  publishedAt?: string;
  runtime: MarketplaceRuntimeRequirement;
  status: PluginReleaseStatus;
  version: string;
}

export interface ExtensionMarketplaceScreenshot {
  alt: string;
  url: string;
}

export interface ExtensionMarketplaceEntry {
  description: string;
  developer: string;
  homepageUrl?: string;
  iconUrl?: string;
  id: string;
  keywords?: string[];
  latestVersion: string;
  longDescription?: string;
  name: string;
  privacyPolicyUrl?: string;
  publishedAt?: string;
  repository: string;
  screenshots?: ExtensionMarketplaceScreenshot[];
  supportUrl?: string;
  termsOfServiceUrl?: string;
  updatedAt?: string;
  versions: ExtensionMarketplaceVersion[];
}

export interface ExtensionMarketplace {
  displayName: string;
  enabled: boolean;
  extensions: ExtensionMarketplaceEntry[];
  generatedAt: string;
  name: string;
  schemaVersion: 1;
}

const assetSchema = object({
  bytes: number().int().nonnegative(),
  resource: string().min(1),
  sha256: string().regex(SHA256_PATTERN),
  url: string().min(1).max(2048),
});

const releaseStatusSchema = zEnum(["active", "blocked"]);

const runtimeSchema = object({
  kind: literal("iframe"),
  protocol: number()
    .int()
    .refine(
      isSupportedSandboxProtocol,
      "Unsupported sandbox protocol; expected 6 or 7"
    )
    .transform((value) => value as 6 | 7),
});

const marketplaceRuntimeSchema = object({
  kind: literal("iframe"),
  protocol: number().int().positive(),
});

const descriptorReferenceSchema = object({
  bytes: number().int().nonnegative(),
  sha256: string().regex(SHA256_PATTERN),
  url: descriptorUrlSchema,
});

const marketplaceVersionSchema = object({
  api: string().min(1),
  descriptor: descriptorReferenceSchema,
  packageSizeBytes: number().int().nonnegative().optional(),
  publishedAt: iso.datetime().optional(),
  runtime: marketplaceRuntimeSchema,
  status: releaseStatusSchema,
  version: string().refine((value) => valid(value) !== null, "Invalid semver"),
});

const marketplaceScreenshotSchema = object({
  alt: string().min(1).max(300),
  url: httpsUrlSchema,
});

const marketplaceEntrySchema = object({
  description: string().min(1),
  developer: string().min(1),
  homepageUrl: httpsUrlSchema.optional(),
  iconUrl: httpsUrlSchema.optional(),
  id: string().min(1),
  keywords: array(string().min(1).max(64)).max(20).optional(),
  latestVersion: string(),
  longDescription: string().min(1).max(20_000).optional(),
  name: string().min(1),
  privacyPolicyUrl: httpsUrlSchema.optional(),
  publishedAt: iso.datetime().optional(),
  repository: httpsUrlSchema,
  screenshots: array(marketplaceScreenshotSchema).max(12).optional(),
  supportUrl: httpsUrlSchema.optional(),
  termsOfServiceUrl: httpsUrlSchema.optional(),
  updatedAt: iso.datetime().optional(),
  versions: array(marketplaceVersionSchema)
    .min(1)
    .max(MAX_MARKETPLACE_VERSIONS),
});

const marketplaceSchema = object({
  displayName: string().min(1).max(100),
  enabled: boolean(),
  extensions: array(marketplaceEntrySchema).max(MAX_MARKETPLACE_EXTENSIONS),
  generatedAt: iso.datetime(),
  name: string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  schemaVersion: literal(1),
});

const releaseDescriptorSchema = object({
  api: string().min(1),
  icon: assetSchema.optional(),
  manifest: unknown(),
  repository: httpsUrlSchema,
  runtime: runtimeSchema,
  script: assetSchema,
  status: releaseStatusSchema,
  style: assetSchema.optional(),
});

function resolveHttpsUrl(
  value: string,
  baseUrl: string | undefined,
  subject: "asset" | "descriptor"
): string {
  let resolved: URL;
  try {
    resolved = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    throw new Error(`Invalid extension ${subject} URL: ${value}`);
  }
  if (resolved.protocol !== "https:") {
    throw new Error(`Extension ${subject} URL must use HTTPS`);
  }
  return resolved.href;
}

function resolveDescriptorUrl(value: string, manifestUrl?: string): string {
  return resolveHttpsUrl(value, manifestUrl, "descriptor");
}

export function parseExtensionMarketplace(
  value: unknown,
  manifestUrl?: string
): ExtensionMarketplace {
  const marketplace = marketplaceSchema.parse(value);
  const ids = new Set<string>();
  const extensions = marketplace.extensions.map((extension) => {
    validateManifest({
      api: extension.versions[0]?.api,
      description: extension.description,
      developer: extension.developer,
      id: extension.id,
      name: extension.name,
      permissions: [],
      version: extension.latestVersion,
    });
    if (ids.has(extension.id)) {
      throw new Error(`Duplicate extension ID: ${extension.id}`);
    }
    ids.add(extension.id);

    const versions = new Set<string>();
    for (const version of extension.versions) {
      if (versions.has(version.version)) {
        throw new Error(
          `Duplicate extension version: ${extension.id}@${version.version}`
        );
      }
      versions.add(version.version);
    }
    if (!versions.has(extension.latestVersion)) {
      throw new Error(
        `Extension "${extension.id}" latest version is not published`
      );
    }

    return {
      ...extension,
      versions: extension.versions.map((version) => ({
        ...version,
        descriptor: {
          ...version.descriptor,
          url: resolveDescriptorUrl(version.descriptor.url, manifestUrl),
        },
      })),
    };
  });
  return { ...marketplace, extensions };
}

export function parsePluginReleaseDescriptor(
  value: unknown,
  expected?: { id: string; version: string },
  descriptorUrl?: string
): PluginReleaseDescriptor {
  const parsed = releaseDescriptorSchema.parse(value);
  const manifest = validateManifest(parsed.manifest);
  if (expected && manifest.id !== expected.id) {
    throw new Error(
      `Extension release ID "${manifest.id}" does not match "${expected.id}"`
    );
  }
  if (expected && manifest.version !== expected.version) {
    throw new Error(
      `Extension release version "${manifest.version}" does not match "${expected.version}"`
    );
  }
  if (parsed.api !== manifest.api) {
    throw new Error(
      `Extension "${manifest.id}" API range does not match manifest`
    );
  }
  const resolveAsset = (asset: PluginAsset): PluginAsset => ({
    ...asset,
    url: resolveHttpsUrl(asset.url, descriptorUrl, "asset"),
  });
  return {
    ...parsed,
    icon: parsed.icon ? resolveAsset(parsed.icon) : undefined,
    manifest,
    script: resolveAsset(parsed.script),
    style: parsed.style ? resolveAsset(parsed.style) : undefined,
  };
}

export function isMarketplaceVersionCompatible(
  apiVersions: string | readonly string[],
  version: ExtensionMarketplaceVersion
): boolean {
  const supported =
    typeof apiVersions === "string" ? [apiVersions] : apiVersions;
  return (
    version.status === "active" &&
    isSupportedSandboxProtocol(version.runtime.protocol) &&
    supported.some((apiVersion) => satisfies(apiVersion, version.api))
  );
}
