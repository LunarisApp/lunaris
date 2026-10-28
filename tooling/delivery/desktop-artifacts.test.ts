import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("installer collection preserves bytes and hashes for both target layouts", () => {
  for (const [target, bundle, extension] of [
    ["x86_64-pc-windows-msvc", "nsis", "exe"],
    ["x86_64-unknown-linux-gnu", "deb", "deb"],
  ]) {
    const root = mkdtempSync(join(tmpdir(), "desktop-artifacts-"));
    directories.push(root);
    mkdirSync(join(root, "apps/desktop"), { recursive: true });
    writeFileSync(
      join(root, "apps/desktop/package.json"),
      '{"version":"1.2.3"}'
    );
    const directory = join(root, `target/${target}/release/bundle/${bundle}`);
    mkdirSync(directory, { recursive: true });
    const input = join(directory, `Lunaris_1.2.3_x64.${extension}`);
    const contents = "fixture installer bytes";
    writeFileSync(input, contents);
    const run = () =>
      spawnSync(
        process.execPath,
        [join(import.meta.dir, "desktop-artifacts.ts"), target!],
        { cwd: root, encoding: "utf8" }
      );
    expect(run().status).toBe(0);
    const name = `Lunaris-desktop-1.2.3-${target}.${extension}`;
    expect(readFileSync(join(root, "dist", name), "utf8")).toBe(contents);
    expect(readFileSync(join(root, "dist/SHA256SUMS"), "utf8")).toBe(
      `${createHash("sha256").update(contents).digest("hex")}  ${name}\n`
    );
    writeFileSync(join(directory, `duplicate.${extension}`), contents);
    expect(run().stderr).toContain("Expected one");
    rmSync(input);
    writeFileSync(join(directory, `duplicate.${extension}`), "");
    expect(run().stderr).toContain("installer is empty");
  }
});
