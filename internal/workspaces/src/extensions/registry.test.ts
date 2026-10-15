import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_PLUGIN_IDS,
  getPluginSubviewRoute,
  loadPlugin,
  PLUGIN_DESCRIPTORS,
  PLUGIN_METADATA,
} from "./registry";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const extensionsRoot = resolve(repoRoot, "extensions");

const extensionDirs = [
  "file",
  "kanban",
  "rich-text",
] as const;

const allowedSdkImports = new Set([
  "@lunarisapp/plugin-sdk",
  "@lunarisapp/plugin-sdk/data",
  "@lunarisapp/plugin-sdk/mcp",
  "@lunarisapp/plugin-sdk/time",
]);

const allowedPublicPrefixes = ["@lunarisapp/ui"] as const;

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']\)/g;

const enabledPluginIds = ["lunaris.rich-text"] as const;

describe("bundled extension registry", () => {
  it("exposes only declared extension subview routes", () => {
    expect(getPluginSubviewRoute("lunaris.kanban", "task")).toBeUndefined();
    expect(getPluginSubviewRoute("lunaris.kanban", "unknown")).toBeUndefined();
    expect(getPluginSubviewRoute("unknown", "task")).toBeUndefined();
  });

  it("exposes enabled extensions", () => {
    for (const pluginId of enabledPluginIds) {
      expect(ALL_PLUGIN_IDS).toContain(pluginId);
      expect(Object.hasOwn(PLUGIN_METADATA, pluginId)).toBe(true);
      expect(
        PLUGIN_DESCRIPTORS.some(({ manifest }) => manifest.id === pluginId)
      ).toBe(true);
    }
  });

  it("loads rich text", async () => {
    const result = await loadPlugin("lunaris.rich-text");

    expect(result.id).toBe("lunaris.rich-text");
    expect(result.error).toBeUndefined();
    expect(result.plugin?.manifest.id).toBe("lunaris.rich-text");
  });
});

describe("extension import boundaries", () => {
  for (const extensionDir of extensionDirs) {
    it(`${extensionDir} imports only public Lunaris APIs, local files, and package deps`, () => {
      const extensionRoot = resolve(extensionsRoot, extensionDir);
      const sourceRoot = resolve(extensionRoot, "src");
      const packageJson = readPackageJson(extensionRoot);
      const privateDependencies = Object.keys({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      }).filter((name) => name.startsWith("@repo/"));
      const declaredPackages = new Set([
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.peerDependencies ?? {}),
      ]);
      const files = listSourceFiles(sourceRoot);
      const violations = privateDependencies.map(
        (name) => `${extensionDir}/package.json: ${name}`
      );
      violations.push(...findForbiddenRepoReferences(sourceRoot));

      for (const file of files) {
        if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
        const absoluteFile = resolve(sourceRoot, file);
        const source = readFileSync(absoluteFile, "utf8");
        for (const match of source.matchAll(importPattern)) {
          const specifier = match[1] ?? match[2];
          if (
            !specifier ||
            isAllowedImport({
              declaredPackages,
              importer: absoluteFile,
              extensionDir,
              sourceRoot,
              specifier,
            })
          ) {
            continue;
          }
          violations.push(`${extensionDir}/${file}: ${specifier}`);
        }
      }

      expect(violations).toEqual([]);
    });
  }

  it("public packages do not import private packages", () => {
    const sdkSource = resolve(repoRoot, "packages/plugin-sdk/src");
    const uiSource = resolve(repoRoot, "packages/ui/src");
    expect(findForbiddenRepoImports(sdkSource, ["@repo"])).toEqual([]);
    expect(findForbiddenRepoImports(uiSource, ["@repo"])).toEqual([]);
  });

  it("lower-level frontend packages do not import workspaces or app-shell", () => {
    for (const packageName of ["data", "features", "plugin-runtime"]) {
      const source = resolve(repoRoot, `internal/${packageName}/src`);
      expect(
        findForbiddenRepoImports(source, ["@repo/app-shell", "@repo/workspaces"]),
      ).toEqual([]);
    }
  });
});

function findForbiddenRepoImports(
  sourceRoot: string,
  forbiddenPrefixes: string[]
): string[] {
  const violations: string[] = [];
  for (const file of listSourceFiles(sourceRoot)) {
    const source = readFileSync(resolve(sourceRoot, file), "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (
        specifier &&
        forbiddenPrefixes.some(
          (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`)
        )
      ) {
        violations.push(`${file}: ${specifier}`);
      }
    }
  }
  return violations;
}

function findForbiddenRepoReferences(sourceRoot: string): string[] {
  const violations: string[] = [];
  const repoReferencePattern = /["'](@repo(?:\/[^"']+)?)["']/g;
  for (const file of listSourceFiles(sourceRoot)) {
    const source = readFileSync(resolve(sourceRoot, file), "utf8");
    for (const match of source.matchAll(repoReferencePattern)) {
      violations.push(`${file}: ${match[1]}`);
    }
  }
  return violations;
}

function isAllowedImport(input: {
  declaredPackages: Set<string>;
  importer: string;
  extensionDir: string;
  sourceRoot: string;
  specifier: string;
}): boolean {
  const { declaredPackages, extensionDir, importer, sourceRoot, specifier } =
    input;

  if (specifier.startsWith(".")) {
    const target = resolve(dirname(importer), specifier);
    const relativeTarget = relative(sourceRoot, target);
    return !relativeTarget.startsWith("..");
  }

  if (
    allowedSdkImports.has(specifier) ||
    allowedPublicPrefixes.some(
      (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`)
    )
  ) {
    return true;
  }

  if (specifier === `@extension/${extensionDir}`) return true;
  if (specifier.startsWith("@extension/")) return false;
  if (specifier.startsWith("@repo/")) return false;

  return declaredPackages.has(packageNameFromSpecifier(specifier));
}

function listSourceFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = resolve(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath, relativePath));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(relativePath);
    }
  }
  return files;
}

function packageNameFromSpecifier(specifier: string): string {
  if (!specifier.startsWith("@")) return specifier.split("/")[0] ?? specifier;
  const [scope, name] = specifier.split("/");
  return `${scope}/${name}`;
}

function readPackageJson(dir: string) {
  return JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
}
