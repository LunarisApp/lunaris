import { describe, expect, test } from "bun:test";
import {
  affectedTargets,
  npmReleaseTargets,
  parseChangeset,
  splitChangeset,
  validateHotfix,
  validateSource,
} from "./policy";

describe("release policy", () => {
  test("only same-repository release and hotfix PRs reach main", () => {
    expect(() => validateSource("main", "next", true)).not.toThrow();
    expect(() => validateSource("main", "hotfix/auth", true)).not.toThrow();
    expect(() => validateSource("next", "feature/auth", false)).not.toThrow();
    expect(() => validateSource("main", "next", false)).toThrow();
    expect(() => validateSource("main", "feature/auth", true)).toThrow();
  });
  test("hotfixes reject minor and major changesets", () => {
    expect(() =>
      validateHotfix("hotfix/auth", [
        { releases: { api: "patch" }, summary: "fix" },
      ])
    ).not.toThrow();
    for (const bump of ["minor", "major"] as const) {
      expect(() =>
        validateHotfix("hotfix/auth", [
          { releases: { api: bump }, summary: "fix" },
        ])
      ).toThrow();
    }
  });
  test("splits mixed native changesets without consuming excluded releases", () => {
    const split = splitChangeset(
      '---\n"desktop": patch\n"@lunarisapp/ui": minor\n---\n\nShared change.\n'
    );
    expect(parseChangeset(split.selected ?? "")).toEqual({
      releases: { "@lunarisapp/ui": "minor" },
      summary: "\nShared change.\n",
    });
    expect(parseChangeset(split.excluded ?? "").releases).toEqual({
      desktop: "patch",
    });
    expect(
      splitChangeset("---\ndesktop: patch\n---\nNative only.").selected
    ).toBeNull();
  });
  test("propagates private dependency changes through transitive consumers", () => {
    const workspaces = [
      { name: "@repo/utils", path: "internal/utils", dependencies: [] },
      {
        name: "@repo/data",
        path: "internal/data",
        dependencies: ["@repo/utils"],
      },
      { name: "web", path: "apps/web", dependencies: ["@repo/data"] },
      { name: "api", path: "apps/api", dependencies: ["@repo/utils"] },
    ];
    expect(affectedTargets(["internal/utils/src/time.ts"], workspaces)).toEqual(
      ["api", "web", "self-hosted"]
    );
    expect(
      affectedTargets(["internal/utils/src/time.test.ts"], workspaces)
    ).toEqual([]);
    expect(affectedTargets(["internal/utils/README.md"], workspaces)).toEqual(
      []
    );
    expect(affectedTargets(["bun.lock"], workspaces)).toHaveLength(7);
    expect(
      affectedTargets(["infra/local/config/sync_rules.yaml"], workspaces)
    ).toEqual(["api", "self-hosted"]);
  });
});

test("self-host deployment and app/sync changes require a bundle release", () => {
  for (const file of [
    "infra/self-host/compose.yaml",
    "infra/self-host/admin.ts",
    "tooling/self-host/bundle.ts",
    "infra/self-host/smoke.sh",
    "infra/local/config/sync_rules.yaml",
  ]) {
    expect(affectedTargets([file], [])).toContain("self-hosted");
  }
  expect(
    affectedTargets(
      ["apps/web/src/main.tsx"],
      [{ name: "web", path: "apps/web", dependencies: [] }]
    )
  ).toEqual(["web", "self-hosted"]);
});

test("npm policy ignores delivery controls but retains package and shared build changes", () => {
  const workspaces = [
    { name: "@lunarisapp/ui", path: "packages/ui", dependencies: [] },
    {
      name: "@lunarisapp/plugin-sdk",
      path: "packages/plugin-sdk",
      dependencies: [],
    },
  ];
  const root = {
    scripts: { build: "turbo build", "release:old": "old" },
    dependencies: { bun: "1" },
  };
  expect(
    npmReleaseTargets(
      [".github/workflows/ci.yml", "tooling/delivery/core.ts", "package.json"],
      workspaces,
      root,
      { ...root, scripts: { build: "turbo build" } }
    )
  ).toEqual([]);
  expect(npmReleaseTargets(["packages/ui/src/button.tsx"], workspaces)).toEqual(
    ["@lunarisapp/ui"]
  );
  expect(npmReleaseTargets(["bun.lock"], workspaces)).toHaveLength(2);
  expect(
    npmReleaseTargets(["package.json"], workspaces, root, {
      ...root,
      scripts: { build: "other" },
    })
  ).toHaveLength(2);
  expect(
    npmReleaseTargets(["package.json"], workspaces, root, {
      ...root,
      dependencies: { bun: "2" },
    })
  ).toHaveLength(2);
});
