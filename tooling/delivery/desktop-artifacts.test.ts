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
import { desktopAssetNames } from "./desktop-updater";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release collection retains updater signatures and checksums on every platform", () => {
  for (const [target, group, bundle, format, updateBundle, updateFormat] of [
    ["universal-apple-darwin", "desktop", "dmg", "dmg", "macos", "app.tar.gz"],
    ["x86_64-pc-windows-msvc", "desktop-windows", "nsis", "exe", "nsis", "exe"],
    [
      "x86_64-unknown-linux-gnu",
      "desktop-linux",
      "deb",
      "deb",
      "appimage",
      "AppImage",
    ],
  ] as const) {
    const root = mkdtempSync(join(tmpdir(), "desktop-update-artifacts-"));
    directories.push(root);
    mkdirSync(join(root, "apps/desktop"), { recursive: true });
    writeFileSync(
      join(root, "apps/desktop/package.json"),
      '{"version":"1.2.3"}'
    );
    const base = join(root, `target/${target}/release/bundle`);
    mkdirSync(join(base, bundle), { recursive: true });
    mkdirSync(join(base, updateBundle), { recursive: true });
    writeFileSync(join(base, bundle, `Lunaris.${format}`), "installer bytes");
    const source = join(base, updateBundle, `Lunaris.${updateFormat}`);
    writeFileSync(source, "updater bytes");
    const run = () =>
      spawnSync(
        process.execPath,
        [join(import.meta.dir, "desktop-artifacts.ts"), target],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PRODUCT_VERSION: "1.2.3",
            LUNARIS_SIGNING_MODE: "adhoc",
          },
        }
      );
    expect(run().status).not.toBe(0);
    const publicKey = Buffer.from(
      `untrusted comment: test public key\n${Buffer.concat([Buffer.from("Ed"), Buffer.alloc(8, 1), Buffer.alloc(32)]).toString("base64")}\n`
    ).toString("base64");
    mkdirSync(join(root, "artifacts"));
    writeFileSync(
      join(root, "artifacts/desktop-updater.conf.json"),
      JSON.stringify({ plugins: { updater: { pubkey: publicKey } } })
    );
    const signatureFor = (keyId: number) =>
      `${Buffer.from(`untrusted comment: test signature\n${Buffer.concat([Buffer.from("ED"), Buffer.alloc(8, keyId), Buffer.alloc(64)]).toString("base64")}\ntrusted comment: test\n${Buffer.alloc(64).toString("base64")}\n`).toString("base64")}\n`;
    writeFileSync(`${source}.sig`, "not-a-signature");
    expect(run().stderr).toContain("Invalid Tauri updater signature");
    writeFileSync(`${source}.sig`, signatureFor(2));
    expect(run().stderr).toContain("Updater signing key does not match");
    const signature = signatureFor(1);
    writeFileSync(`${source}.sig`, signature);
    expect(run().status).toBe(0);
    const names = desktopAssetNames("1.2.3", group, true);
    expect(readFileSync(join(root, "dist", names.signature), "utf8")).toBe(
      signature
    );
    expect(readFileSync(join(root, "dist", names.update), "utf8")).toBe(
      "updater bytes"
    );
    const sums = readFileSync(join(root, "dist/SHA256SUMS"), "utf8");
    for (const name of new Set(Object.values(names))) {
      const hash = createHash("sha256")
        .update(readFileSync(join(root, "dist", name)))
        .digest("hex");
      expect(sums).toContain(`${hash}  ${name}\n`);
    }
    writeFileSync(`${source}.sig`, " \n");
    expect(run().stderr).toContain("signature is empty");
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
