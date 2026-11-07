import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release config requires keys and never writes the private key", () => {
  const root = mkdtempSync(join(tmpdir(), "updater-config-"));
  roots.push(root);
  const run = (publicKey: string, privateKey = "fixture-private-secret") =>
    spawnSync(
      process.execPath,
      [join(import.meta.dir, "desktop-updater-config.ts")],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          TAURI_UPDATER_PUBLIC_KEY: publicKey,
          TAURI_SIGNING_PRIVATE_KEY: privateKey,
        },
      }
    );
  expect(run("").stderr).toContain("Desktop releases require");
  expect(run("not-a-key").stderr).toContain("base64-encoded Tauri public key");
  const publicKey = Buffer.from(
    `untrusted comment: test public key\n${Buffer.concat([Buffer.from("Ed"), Buffer.alloc(40)]).toString("base64")}\n`
  ).toString("base64");
  expect(run(publicKey, "").status).not.toBe(0);
  const result = run(publicKey);
  expect(result.status).toBe(0);
  const content = readFileSync(
    join(root, "artifacts/desktop-updater.conf.json"),
    "utf8"
  );
  expect(JSON.parse(content)).toEqual({
    bundle: { createUpdaterArtifacts: true },
    plugins: { updater: { pubkey: publicKey } },
  });
  expect(content + result.stdout + result.stderr).not.toContain(
    "fixture-private-secret"
  );
});
