import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stableVersion } from "./product";
import { desktopAssetNames } from "./desktop-updater";
import { assertUpdaterSigningKey } from "./desktop-updater-signature";

const target = process.argv[2];
const format =
  target === "x86_64-pc-windows-msvc"
    ? "exe"
    : target === "x86_64-unknown-linux-gnu"
      ? "deb"
      : target === "universal-apple-darwin"
        ? "dmg"
        : undefined;
if (!format) {
  throw new Error(`Unsupported desktop target: ${target}`);
}
const version = JSON.parse(readFileSync("apps/desktop/package.json", "utf8"))
  .version as string;
if (!stableVersion.test(version)) {
  throw new Error("Expected stable desktop version");
}
const directory = resolve(`target/${target}/release/bundle`);
const files = [...new Bun.Glob(`**/*.${format}`).scanSync(directory)];
if (files.length !== 1) {
  throw new Error(`Expected one ${format} installer; found ${files.length}`);
}
const source = resolve(directory, files[0]!);
const bytes = readFileSync(source);
if (bytes.length === 0) {
  throw new Error("Desktop installer is empty");
}
const group =
  format === "dmg"
    ? "desktop"
    : format === "exe"
      ? "desktop-windows"
      : "desktop-linux";
const names = desktopAssetNames(
  version,
  group,
  process.env.LUNARIS_SIGNING_MODE === "adhoc"
);
mkdirSync("dist", { recursive: true });
copyFileSync(source, resolve("dist", names.installer));
const collected = [names.installer];
if (process.env.PRODUCT_VERSION) {
  const pattern =
    format === "dmg"
      ? "**/*.app.tar.gz"
      : format === "exe"
        ? "**/*.exe"
        : "**/*.AppImage";
  const updates = [...new Bun.Glob(pattern).scanSync(directory)];
  if (updates.length !== 1) {
    throw new Error(`Expected one updater artifact; found ${updates.length}`);
  }
  const update = resolve(directory, updates[0]!);
  const signature = readFileSync(`${update}.sig`, "utf8");
  if (!(readFileSync(update).length && signature.trim())) {
    throw new Error("Updater artifact or signature is empty");
  }
  const config = JSON.parse(
    readFileSync("artifacts/desktop-updater.conf.json", "utf8")
  );
  assertUpdaterSigningKey(config.plugins?.updater?.pubkey ?? "", signature);
  if (names.update !== names.installer) {
    copyFileSync(update, resolve("dist", names.update));
    collected.push(names.update);
  }
  copyFileSync(`${update}.sig`, resolve("dist", names.signature));
  collected.push(names.signature);
}
writeFileSync(
  "dist/SHA256SUMS",
  collected
    .map(
      (asset) =>
        `${createHash("sha256")
          .update(readFileSync(resolve("dist", asset)))
          .digest("hex")}  ${asset}\n`
    )
    .join("")
);
