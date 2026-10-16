import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { createBundle, type BundleOptions } from "./bundle";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function options(): BundleOptions {
  const root = mkdtempSync(join(tmpdir(), "lunaris-bundle-"));
  roots.push(root);
  return {
    directory: join(root, "deployment"),
    version: "1.2.3",
    sourceCommit: "a".repeat(40),
    apiImage: `ghcr.io/lunarisapp/lunaris-api@sha256:${"b".repeat(64)}`,
    webImage: `ghcr.io/lunarisapp/lunaris-web@sha256:${"c".repeat(64)}`,
  };
}
test("release bundle pins images, ships canonical sync rules, excludes secrets/build sources", () => {
  const input = options();
  createBundle(input);
  const files = readdirSync(input.directory);
  expect(files).not.toContain(".env");
  expect(files).not.toContain("Dockerfile");
  expect(files).not.toContain("compose.override.yaml");
  const compose = parse(
    readFileSync(join(input.directory, "compose.yaml"), "utf8")
  );
  expect(Object.keys(compose.services)).toHaveLength(6);
  expect(compose.services.api.image).toBe(input.apiImage);
  expect(compose.services.web.image).toBe(input.webImage);
  for (const [name, service] of Object.entries(compose.services) as [
    string,
    { image: string; ports?: string[] },
  ][]) {
    expect(service.image).toMatch(/@sha256:[a-f0-9]{64}$/);
    if (name !== "web") {
      expect(service.ports).toBeUndefined();
    }
  }
  expect(readFileSync(join(input.directory, "sync_rules.yaml"), "utf8")).toBe(
    readFileSync("infra/local/config/sync_rules.yaml", "utf8")
  );
  expect(
    JSON.parse(readFileSync(join(input.directory, "release.json"), "utf8"))
  ).toEqual({
    version: input.version,
    sourceCommit: input.sourceCommit,
    images: { api: input.apiImage, web: input.webImage },
  });
});
test("rejects mutable images, wrong repositories and incomplete release provenance", () => {
  for (const overrides of [
    { apiImage: "ghcr.io/lunarisapp/lunaris-api:latest" },
    { apiImage: `ghcr.io/other/api@sha256:${"b".repeat(64)}` },
    { webImage: `ghcr.io/lunarisapp/lunaris-api@sha256:${"b".repeat(64)}` },
    { sourceCommit: "short" },
    { version: "latest" },
  ]) {
    expect(() => createBundle({ ...options(), ...overrides })).toThrow();
  }
});
test("refuses to overwrite an existing installation directory", () => {
  const input = options();
  createBundle(input);
  expect(() => createBundle(input)).toThrow();
});
