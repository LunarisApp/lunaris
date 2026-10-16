import { spawnSync } from "bun";
import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "../release/automation/process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture(registry: "conflict" | "unavailable" = "conflict") {
  const root = mkdtempSync(join(tmpdir(), "lunaris-image-publication-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  const cwd = join(root, "work");
  run("git", ["init", "--bare", remote]);
  run("git", ["clone", remote, cwd]);
  const git = (...args: string[]) => run("git", args, { cwd }).text;
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("checkout", "-b", "main");
  mkdirSync(join(cwd, "infra/self-host"), { recursive: true });
  writeFileSync(
    join(cwd, "infra/self-host/package.json"),
    JSON.stringify({ name: "self-hosted", version: "1.0.0" })
  );
  git("add", ".");
  git("commit", "-m", "source");
  const sourceCommit = git("rev-parse", "HEAD");
  mkdirSync(join(cwd, ".release"));
  writeFileSync(
    join(cwd, ".release/manifest.json"),
    JSON.stringify({
      sourceCommit,
      releases: [
        {
          name: "self-hosted",
          path: "infra/self-host",
          kind: "self-hosted",
          version: "1.0.0",
          tag: "self-hosted@1.0.0",
          notes: "Deployment",
        },
      ],
    })
  );
  git("add", ".");
  git("commit", "-m", "version");
  const sha = git("rev-parse", "HEAD");
  git("tag", "self-hosted@1.0.0");
  git("push", "origin", "main", "--tags");
  for (const arch of ["amd64", "arm64"]) {
    mkdirSync(join(cwd, "artifacts", arch), { recursive: true });
    writeFileSync(
      join(cwd, "artifacts", arch, "images.json"),
      JSON.stringify({
        sourceCommit: sha,
        platform: `linux/${arch}`,
        api: `sha256:${"a".repeat(64)}`,
        web: `sha256:${"b".repeat(64)}`,
      })
    );
  }
  const bin = join(root, "bin");
  mkdirSync(bin);
  const calls = join(root, "calls");
  const docker = join(bin, "docker");
  writeFileSync(
    docker,
    `#!/bin/sh
printf '%s\\n' "$*" >> '${calls}'
${registry === "conflict" ? `echo '{"annotations":{"org.opencontainers.image.revision":"other-source"}}'` : "echo 'connection reset by peer' >&2; exit 1"}
`
  );
  chmodSync(docker, 0o755);
  const invoke = () =>
    spawnSync(
      [
        process.execPath,
        resolve(import.meta.dirname, "release.ts"),
        "publish",
        "artifacts",
      ],
      { cwd, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
    );
  return { cwd, calls, invoke };
}
test("publication rejects mismatched platform receipts before contacting registry", () => {
  const f = fixture();
  const receipt = join(f.cwd, "artifacts/arm64/images.json");
  const v = JSON.parse(readFileSync(receipt, "utf8"));
  v.sourceCommit = "c".repeat(40);
  writeFileSync(receipt, JSON.stringify(v));
  const result = f.invoke();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain(
    "does not match validated release"
  );
  expect(existsSync(f.calls)).toBe(false);
});
test("publication never replaces an existing image from another source", () => {
  const f = fixture();
  const result = f.invoke();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("Refusing to replace");
  expect(readFileSync(f.calls, "utf8")).not.toContain("create");
});
test("registry transport failures never authorize tag creation", () => {
  const f = fixture("unavailable");
  const result = f.invoke();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("registry access recovers");
  expect(readFileSync(f.calls, "utf8")).not.toContain("create");
});
