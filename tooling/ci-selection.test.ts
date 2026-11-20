import { expect, test } from "bun:test";
import { selectChecks } from "./ci-selection";

test("repository docs skip builds; application docs still build", () => {
  expect(
    Object.values(selectChecks(["docs/guide.md", "README.md"], ["web"])).every(
      (value) => !value
    )
  ).toBe(true);
  expect(selectChecks(["apps/docs/content/guide.mdx"], ["docs"]).docs).toBe(
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
  expect(checks.docs).toBe(false);
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
  expect(Object.values(selectChecks([], [], "full")).every(Boolean)).toBe(true);
});

test("landing-only PRs avoid native, core and installer jobs", () => {
  const selected = selectChecks(["apps/landing/src/app/page.tsx"], ["landing"]);
  expect(selected.landing).toBe(true);
  for (const name of [
    "docs",
    "editions",
    "smoke",
    "self-hosted",
    "agent-rust",
    "desktop-mcp",
  ]) {
    expect(selected[name as keyof typeof selected]).toBe(false);
  }
});
test("ordinary core changes retain smoke and edition checks without full installer matrix", () => {
  const selected = selectChecks(["apps/api/src/account/service.ts"], ["api"]);
  expect(selected.smoke).toBe(true);
  expect(selected.editions).toBe(true);
  expect(selected["self-hosted"]).toBe(false);
  expect(
    selectChecks(["infra/self-host/compose.yaml"], [])["self-hosted"]
  ).toBe(true);
});

test("repository administration skips image builds while runtime delivery retains full validation", () => {
  for (const file of [
    "tooling/delivery/cutover.ts",
    "tooling/delivery/cutover.integration.test.ts",
    "tooling/delivery/repository-settings.ts",
  ]) {
    expect(
      Object.values(selectChecks([file], [])).every((value) => !value)
    ).toBe(true);
  }
  for (const file of [
    "tooling/delivery/core.ts",
    "tooling/delivery/product-release.ts",
    "tooling/delivery/affected.ts",
  ]) {
    expect(Object.values(selectChecks([file], [])).every(Boolean)).toBe(true);
  }
});

test("desktop dependencies select native Windows/Linux packaging", () => {
  expect(
    selectChecks(["internal/data/src/schema.ts"], ["desktop"])[
      "desktop-platforms"
    ]
  ).toBe(true);
  expect(
    selectChecks(["apps/landing/src/page.tsx"], ["landing"])[
      "desktop-platforms"
    ]
  ).toBe(false);
});

test.each([
  [
    "workspace banners",
    [
      "README.md",
      "internal/features/src/announcements/banners/ceo-chat.tsx",
      "internal/workspaces/src/routes/workspaces.tsx",
    ],
  ],
  [
    "shared spinner",
    [
      ".changeset/quarter-ring-spinner.md",
      "extensions/rich-text/src/entity-reference-inline.tsx",
      "extensions/rich-text/src/styles.css",
      "internal/agent-work/src/message.tsx",
      "packages/ui/src/components/spinner.tsx",
    ],
  ],
] satisfies [string, string[]][])(
  "%s PR skips only the two native desktop checks",
  (_, files) => {
    const push = selectChecks(files, []);
    expect(push.editions).toBe(true);
    expect(push["desktop-mcp"]).toBe(true);
    expect(push["desktop-platforms"]).toBe(true);
    expect(selectChecks(files, [], "pull-request")).toEqual({
      ...push,
      "desktop-mcp": false,
      "desktop-platforms": false,
    });
    expect(Object.values(selectChecks(files, [], "full")).every(Boolean)).toBe(
      true
    );
  }
);

test.each([
  "internal/platform/src/index.tsx",
  "internal/workspaces/src/routes/workspace-desktop-shell.tsx",
  "apps/desktop/src/main.tsx",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/agent-work/index.ts",
  "extensions/kanban/src/mcp-contract.ts",
  "packages/ui/package.json",
  "crates/agent-mcp/src/lib.rs",
  ".changeset/config.json",
  "tooling/unknown.ts",
])("mixed UI PR retains native desktop coverage for %s", (other) => {
  const selected = selectChecks(
    ["packages/ui/src/components/spinner.tsx", other],
    [],
    "pull-request"
  );
  expect(selected["desktop-mcp"]).toBe(true);
  expect(selected["desktop-platforms"]).toBe(true);
});
