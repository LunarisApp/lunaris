import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stableVersion } from "./product";

const target = process.argv[2];
const format =
  target === "x86_64-pc-windows-msvc"
    ? "exe"
    : target === "x86_64-unknown-linux-gnu"
      ? "deb"
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
const name = `Lunaris-desktop-${version}-${target}.${format}`;
mkdirSync("dist", { recursive: true });
copyFileSync(source, resolve("dist", name));
writeFileSync(
  "dist/SHA256SUMS",
  `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`
);
