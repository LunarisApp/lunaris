import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RESTRICTED_PLATFORM_CALLS = [
  /document\.createElement\(["']a["']\)/,
  /navigator\.clipboard/,
  /navigator\.onLine/,
  /navigator\.platform/,
  /userAgentData/,
  /window\.innerWidth/,
  /window\.location\.(?:assign|href|origin|reload)/,
  /\bwindow\.open\s*\(/,
  /window\.(?:add|remove)EventListener\(["'](?:offline|online)["']/,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

describe("platform boundary", () => {
  it("keeps shared app code behind @repo/platform", () => {
    const internalRoot = resolve(import.meta.dirname, "../..");
    const roots = [
      resolve(internalRoot, "app-shell/src"),
      resolve(internalRoot, "features/src"),
    ];
    const violations = roots.flatMap((root) =>
      sourceFiles(root).flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return RESTRICTED_PLATFORM_CALLS.filter((pattern) =>
          pattern.test(source)
        ).map(
          (pattern) => `${path.replace(`${internalRoot}/`, "")}: ${pattern}`
        );
      })
    );

    expect(violations).toEqual([]);
  });
});
