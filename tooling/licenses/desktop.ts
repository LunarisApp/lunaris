import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const destination = join(root, "apps/desktop/src-tauri/notices");
mkdirSync(destination, { recursive: true });
for (const file of [
  "LICENSE",
  "THIRD-PARTY-NOTICES.md",
  "THIRD-PARTY-LICENSES.md",
  "EXTEND-LICENSE.txt",
]) {
  copyFileSync(join(root, "apps/desktop/dist", file), join(destination, file));
}
const { edition } = JSON.parse(readFileSync(join(root, "apps/desktop/dist/edition.json"), "utf8"));
const enterpriseNotice = join(destination, "EE-LICENSE.txt");
if (edition === "enterprise") {
  copyFileSync(join(root, "apps/desktop/dist/EE-LICENSE.txt"), enterpriseNotice);
} else {
  rmSync(enterpriseNotice, { force: true });
}
const result = Bun.spawnSync(
  [
    "cargo",
    "about",
    "generate",
    "--manifest-path",
    "apps/desktop/src-tauri/Cargo.toml",
    "--config",
    "tooling/licenses/about.toml",
    "--locked",
    "--fail",
    "--output-file",
    join(destination, "RUST-LICENSES.txt"),
    "tooling/licenses/about.hbs",
  ],
  { cwd: root, stdout: "inherit", stderr: "inherit" },
);
if (result.exitCode !== 0) process.exit(result.exitCode);
