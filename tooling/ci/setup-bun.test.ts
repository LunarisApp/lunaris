import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function invoke(manifest: unknown) {
  const root = mkdtempSync(join(tmpdir(), "lunaris-bun-setup-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  const output = join(root, "output");
  const environment = join(root, "environment");
  const result = Bun.spawnSync(
    ["node", resolve(".github/actions/setup-bun/version.cjs")],
    {
      cwd: root,
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_ENV: environment },
    }
  );
  return { result, output, environment };
}

test("setup exports exact repository version for installer and cache keys", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  for (const packageManager of [manifest.packageManager, "bun@2.10.3"]) {
    const { result, output, environment } = invoke({ packageManager });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(output, "utf8")).toBe(
      `version=${packageManager.slice(4)}\n`
    );
    expect(readFileSync(environment, "utf8")).toBe(
      `BUN_VERSION=${packageManager.slice(4)}\n`
    );
  }
});

test("setup rejects missing, ranged, malformed, or non-Bun package managers", () => {
  for (const packageManager of [
    undefined,
    null,
    140,
    "npm@1.4.0",
    "bun@latest",
    "bun@^1.4.0",
    "bun@1.4",
    "bun@01.4.0",
    "bun@1.4.0\nOTHER=value",
  ]) {
    const { result } = invoke({ packageManager });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain(
      "packageManager must pin an exact Bun version"
    );
  }
});
