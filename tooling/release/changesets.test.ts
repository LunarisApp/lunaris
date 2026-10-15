import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
}

describe("Changesets public package policy", () => {
  test("keeps public packages independently versioned and publishable", () => {
    const config = readJson<{
      access: string;
      fixed: string[][];
      ignore: string[];
      linked: string[][];
    }>(".changeset/config.json");

    expect(config.access).toBe("public");
    expect(config.fixed).toEqual([]);
    expect(config.linked).toEqual([]);
    expect(config.ignore).not.toContain("@lunarisapp/plugin-sdk");
    expect(config.ignore).not.toContain("@lunarisapp/ui");
  });

  test("keeps internal libraries out of release versioning", () => {
    const config = readJson<{ ignore: string[] }>(".changeset/config.json");
    const internalNames = [
      "@repo/agent-contracts",
      "@repo/app-shell",
      "@repo/auth",
      "@repo/data",
      "@repo/features",
      "@repo/ee-audit",
      "@repo/ee-teams",
      "@repo/ee-composition",
      "@repo/platform",
      "@repo/typescript-config",
      "@repo/utils",
    ];

    expect(config.ignore).toEqual(expect.arrayContaining(internalNames));
  });
});
