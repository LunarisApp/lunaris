import { expect, test } from "bun:test";
import { selectChecks } from "./ci-selection";

test("repository docs skip builds; application docs still build", () => {
  expect(
    Object.values(selectChecks(["docs/guide.md", "README.md"], ["web"])).every(
      (value) => !value
    )
  ).toBe(true);
  expect(selectChecks(["apps/docs/content/guide.mdx"], ["docs"]).sites).toBe(
    true
  );
});

test("shared data changes select dependent applications", () => {
  const checks = selectChecks(
    ["internal/data/src/schema.ts"],
    ["@repo/data", "web", "desktop"]
  );
  expect(checks.editions).toBe(true);
  expect(checks["desktop-mcp"]).toBe(true);
  expect(checks.powersync).toBe(true);
  expect(checks.sites).toBe(false);
});

test("Rust, contract, generated asset and release inputs retain coverage", () => {
  expect(selectChecks(["crates/agent-mcp/src/lib.rs"], [])["agent-rust"]).toBe(
    true
  );
  expect(selectChecks(["crates/agent-mcp/src/lib.rs"], [])["desktop-mcp"]).toBe(
    true
  );
  expect(
    selectChecks(["extensions/kanban/src/index.ts"], ["@repo/agent-contracts"])[
      "agent-rust"
    ]
  ).toBe(true);
  expect(selectChecks(["apps/web/public/icon.svg"], ["web"]).brand).toBe(true);
  expect(selectChecks([".changeset/config.json"], []).release).toBe(true);
});

test("unknown inputs, root configuration and release runs select everything", () => {
  for (const file of [
    "bun.lock",
    "Cargo.lock",
    "turbo.json",
    "tooling/new-generator.ts",
    ".github/workflows/ci.yml",
    "THIRD-PARTY-NOTICES.md",
  ]) {
    expect(Object.values(selectChecks([file], [])).every(Boolean)).toBe(true);
  }
  expect(Object.values(selectChecks([], [], true)).every(Boolean)).toBe(true);
});
