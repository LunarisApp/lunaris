/**
 * Extension manifest types and validation.
 * Each external extension includes a manifest.json file that declares
 * its identity and version compatibility.
 */

import { satisfies, valid, validRange } from "semver";

export const PLUGIN_API_VERSION = "0.10.0";
export const PLUGIN_API_SUPPORTED_VERSIONS = [
  "0.9.0",
  PLUGIN_API_VERSION,
] as const;
export const PLUGIN_PERMISSIONS = [
  "content.read",
  "content.write",
  "files.read",
  "files.write",
  "downloads.write",
  "network.https",
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/** Extension manifest schema (manifest.json) */
export interface PluginManifest {
  /** Required Lunaris plugin API range. */
  api: string;
  /** Plugin versions that cannot run alongside this plugin. */
  conflicts: Readonly<Record<string, string>>;
  /** Required plugin versions. */
  dependencies: Readonly<Record<string, string>>;
  /** Display description for registries before loading extension code */
  description: string;
  /** Developer or organization responsible for the extension */
  developer: string;
  /** Unique extension identifier (lowercase dotted or kebab segments, max 50 chars) */
  id: string;
  /** Optional search terms shown in extension details */
  keywords?: readonly string[];
  /** Optional full description for extension detail views */
  longDescription?: string;
  /** Display name */
  name: string;
  /** Optional plugin versions. Never blocks activation. */
  optionalDependencies: Readonly<Record<string, string>>;
  /** Host capabilities requested by this plugin. */
  permissions: readonly PluginPermission[];
  /** Semantic version of the extension */
  version: string;
  /** Optional HTTPS website for the extension or developer */
  website?: string;
}

/** Error thrown when an extension manifest is invalid */
export class ManifestValidationError extends Error {
  readonly pluginId: string | undefined;
  readonly field: string;

  constructor(pluginId: string | undefined, field: string, message: string) {
    super(
      `Invalid extension manifest${pluginId ? ` (${pluginId})` : ""}: ${message}`
    );
    this.name = "ManifestValidationError";
    this.pluginId = pluginId;
    this.field = field;
  }
}

/** Error thrown when an extension's API version requirement doesn't match */
export class ApiVersionMismatchError extends Error {
  readonly pluginId: string;
  readonly required: string;
  readonly actual: string;

  constructor(pluginId: string, required: string, actual: string) {
    super(
      `Extension "${pluginId}" requires API ${required}, but ${actual} is installed`
    );
    this.name = "ApiVersionMismatchError";
    this.pluginId = pluginId;
    this.required = required;
    this.actual = actual;
  }
}

export function isPluginApiRangeSupported(
  range: string,
  versions: readonly string[] = PLUGIN_API_SUPPORTED_VERSIONS
): boolean {
  return versions.some((version) => satisfies(version, range));
}

export function validateSupportedManifest(input: unknown): PluginManifest {
  const manifest = validateManifest(input);
  if (!isPluginApiRangeSupported(manifest.api)) {
    throw new ApiVersionMismatchError(
      manifest.id,
      manifest.api,
      PLUGIN_API_SUPPORTED_VERSIONS.join(", ")
    );
  }
  return manifest;
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
const MAX_PLUGIN_ID_LENGTH = 50;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 64;
const MAX_WEBSITE_LENGTH = 2048;

function parseDependencyMap(
  value: unknown,
  field: "conflicts" | "dependencies" | "optionalDependencies",
  pluginId: string
): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ManifestValidationError(
      pluginId,
      field,
      `${field} must be an object`
    );
  }
  const result: Record<string, string> = {};
  for (const [id, range] of Object.entries(value)) {
    if (
      id.length > MAX_PLUGIN_ID_LENGTH ||
      !PLUGIN_ID_PATTERN.test(id) ||
      typeof range !== "string" ||
      !validRange(range)
    ) {
      throw new ManifestValidationError(
        pluginId,
        field,
        `${field} entries must map plugin IDs to semver ranges`
      );
    }
    result[id] = range;
  }
  return result;
}

/**
 * Validate an extension manifest object.
 * @throws ManifestValidationError if the manifest is invalid
 */
export function validateManifest(
  manifest: unknown,
  currentApiVersion?: string
): PluginManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new ManifestValidationError(
      undefined,
      "root",
      "manifest must be an object"
    );
  }

  const m = manifest as Record<string, unknown>;

  // Required string fields
  if (typeof m.id !== "string" || m.id.length === 0) {
    throw new ManifestValidationError(
      undefined,
      "id",
      "id is required and must be a non-empty string"
    );
  }

  if (!PLUGIN_ID_PATTERN.test(m.id)) {
    throw new ManifestValidationError(
      m.id as string,
      "id",
      "id must be lowercase segments separated by dots; each segment may contain letters, numbers, and hyphens"
    );
  }

  if (m.id.length > MAX_PLUGIN_ID_LENGTH) {
    throw new ManifestValidationError(
      m.id as string,
      "id",
      `id must be ${MAX_PLUGIN_ID_LENGTH} characters or fewer`
    );
  }

  const id = m.id as string;

  const allowedFields = new Set([
    "api",
    "conflicts",
    "dependencies",
    "optionalDependencies",
    "description",
    "developer",
    "id",
    "keywords",
    "longDescription",
    "name",
    "permissions",
    "version",
    "website",
  ]);
  const unknownField = Object.keys(m).find(
    (field) => !allowedFields.has(field)
  );
  if (unknownField) {
    throw new ManifestValidationError(
      id,
      unknownField,
      `unknown field: ${unknownField}`
    );
  }

  if (typeof m.name !== "string" || m.name.length === 0) {
    throw new ManifestValidationError(
      id,
      "name",
      "name is required and must be a non-empty string"
    );
  }

  if (typeof m.description !== "string" || m.description.length === 0) {
    throw new ManifestValidationError(
      id,
      "description",
      "description is required and must be a non-empty string"
    );
  }

  if (
    m.longDescription !== undefined &&
    (typeof m.longDescription !== "string" || m.longDescription.length === 0)
  ) {
    throw new ManifestValidationError(
      id,
      "longDescription",
      "longDescription must be a non-empty string"
    );
  }

  if (typeof m.developer !== "string" || m.developer.length === 0) {
    throw new ManifestValidationError(
      id,
      "developer",
      "developer is required and must be a non-empty string"
    );
  }

  let keywords: string[] | undefined;
  if (m.keywords !== undefined) {
    if (
      !Array.isArray(m.keywords) ||
      m.keywords.length > MAX_KEYWORDS ||
      !m.keywords.every(
        (keyword) =>
          typeof keyword === "string" &&
          keyword.trim().length > 0 &&
          keyword.length <= MAX_KEYWORD_LENGTH
      )
    ) {
      throw new ManifestValidationError(
        id,
        "keywords",
        `keywords must contain at most ${MAX_KEYWORDS} non-empty strings of ${MAX_KEYWORD_LENGTH} characters or fewer`
      );
    }
    if (
      new Set(m.keywords.map((keyword) => keyword.toLowerCase())).size !==
      m.keywords.length
    ) {
      throw new ManifestValidationError(
        id,
        "keywords",
        "keywords must not contain duplicates"
      );
    }
    keywords = [...m.keywords];
  }

  if (m.website !== undefined) {
    if (
      typeof m.website !== "string" ||
      m.website.length === 0 ||
      m.website.length > MAX_WEBSITE_LENGTH
    ) {
      throw new ManifestValidationError(
        id,
        "website",
        "website must be a non-empty HTTPS URL"
      );
    }
    try {
      const website = new URL(m.website);
      if (website.protocol !== "https:") {
        throw new Error("not HTTPS");
      }
    } catch {
      throw new ManifestValidationError(
        id,
        "website",
        "website must be a valid HTTPS URL"
      );
    }
  }

  if (typeof m.version !== "string" || m.version.length === 0) {
    throw new ManifestValidationError(
      id,
      "version",
      "version is required and must be a non-empty string"
    );
  }
  if (!valid(m.version)) {
    throw new ManifestValidationError(
      id,
      "version",
      "version must be valid semver"
    );
  }

  if (typeof m.api !== "string" || m.api.length === 0) {
    throw new ManifestValidationError(
      id,
      "api",
      'api version range is required (e.g. "^0.9.0")'
    );
  }
  if (!validRange(m.api)) {
    throw new ManifestValidationError(
      id,
      "api",
      "api must be a valid semver range"
    );
  }
  if (currentApiVersion && !satisfies(currentApiVersion, m.api)) {
    throw new ApiVersionMismatchError(id, m.api, currentApiVersion);
  }

  if (!Array.isArray(m.permissions)) {
    throw new ManifestValidationError(
      id,
      "permissions",
      "permissions must be an array"
    );
  }
  if (
    !m.permissions.every((permission) =>
      PLUGIN_PERMISSIONS.includes(permission as PluginPermission)
    )
  ) {
    throw new ManifestValidationError(
      id,
      "permissions",
      `permissions must be one of: ${PLUGIN_PERMISSIONS.join(", ")}`
    );
  }
  if (new Set(m.permissions).size !== m.permissions.length) {
    throw new ManifestValidationError(
      id,
      "permissions",
      "permissions must not contain duplicates"
    );
  }

  const dependencies = parseDependencyMap(m.dependencies, "dependencies", id);
  const optionalDependencies = parseDependencyMap(
    m.optionalDependencies,
    "optionalDependencies",
    id
  );
  const conflicts = parseDependencyMap(m.conflicts, "conflicts", id);
  if (
    Object.hasOwn(dependencies, id) ||
    Object.hasOwn(optionalDependencies, id) ||
    Object.hasOwn(conflicts, id)
  ) {
    throw new ManifestValidationError(
      id,
      "dependencies",
      "plugin cannot depend on or conflict with itself"
    );
  }
  const contradictory = Object.keys(dependencies).find((dependencyId) =>
    Object.hasOwn(conflicts, dependencyId)
  );
  if (contradictory) {
    throw new ManifestValidationError(
      id,
      "conflicts",
      `plugin cannot depend on and conflict with "${contradictory}"`
    );
  }
  const duplicateDependency = Object.keys(dependencies).find((dependencyId) =>
    Object.hasOwn(optionalDependencies, dependencyId)
  );
  if (duplicateDependency) {
    throw new ManifestValidationError(
      id,
      "optionalDependencies",
      `plugin dependency "${duplicateDependency}" cannot be both required and optional`
    );
  }
  const optionalConflict = Object.keys(optionalDependencies).find(
    (dependencyId) => Object.hasOwn(conflicts, dependencyId)
  );
  if (optionalConflict) {
    throw new ManifestValidationError(
      id,
      "conflicts",
      `plugin cannot optionally depend on and conflict with "${optionalConflict}"`
    );
  }

  return {
    api: m.api as string,
    conflicts,
    dependencies,
    description: m.description as string,
    developer: m.developer as string,
    id,
    ...(keywords && { keywords }),
    ...(typeof m.longDescription === "string" && {
      longDescription: m.longDescription,
    }),
    name: m.name as string,
    optionalDependencies,
    permissions: [...m.permissions] as PluginPermission[],
    version: m.version as string,
    ...(typeof m.website === "string" && { website: m.website }),
  };
}
