import { readFileSync, writeFileSync } from "node:fs";
import { collectNotices } from "../../../tooling/licenses/notices";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const host = Bun.spawnSync(["rustc", "-vV"])
  .stdout.toString()
  .match(/^host: (.+)$/m)?.[1];
const target = process.env.TAURI_ENV_TARGET_TRIPLE ?? host;
if (!target) {
  throw new Error("Cannot determine the desktop build target");
}
const bunTargets: Record<string, string> = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
};
await mkdir(join(root, "src-tauri/binaries"), { recursive: true });
const notices = join(root, "src-tauri/notices");
await mkdir(notices, { recursive: true });
await Bun.write(
  join(notices, "BUN-RUNTIME.md"),
  `# Bun runtime\n\nVersion: ${Bun.version}\nRevision: ${Bun.revision}\n\nSource: https://github.com/oven-sh/bun/tree/${Bun.revision}\nLicense: https://github.com/oven-sh/bun/blob/${Bun.revision}/LICENSE.md\nBuild instructions: https://github.com/oven-sh/bun/tree/${Bun.revision}/CONTRIBUTING.md\n\nSee THIRD-PARTY-NOTICES.md for source and relinking requirements.\n`
);
function compile(target: string) {
  const bunTarget = bunTargets[target];
  if (!bunTarget) {
    throw new Error(`Unsupported Agent Work target: ${target}`);
  }
  const output = join(
    root,
    `src-tauri/binaries/lunaris-agent-${target}${target.includes("windows") ? ".exe" : ""}`
  );
  const metafile = join(root, `src-tauri/binaries/agent-${target}.json`);
  const result = Bun.spawnSync(
    [
      "bun",
      "build",
      "--compile",
      "--no-compile-autoload-bunfig",
      `--metafile=${metafile}`,
      `--target=${bunTarget}`,
      "agent-work/main.ts",
      "--outfile",
      output,
    ],
    { cwd: root, stdout: "inherit", stderr: "inherit" }
  );
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
  const metadata = JSON.parse(readFileSync(metafile, "utf8")) as {
    inputs: Record<string, unknown>;
  };
  writeFileSync(
    join(notices, `AGENT-${target}-LICENSES.md`),
    collectNotices(Object.keys(metadata.inputs), root)
  );
  return output;
}

if (target === "universal-apple-darwin") {
  const arm = compile("aarch64-apple-darwin");
  const intel = compile("x86_64-apple-darwin");
  const result = Bun.spawnSync(
    [
      "lipo",
      "-create",
      arm,
      intel,
      "-output",
      join(root, "src-tauri/binaries/lunaris-agent-universal-apple-darwin"),
    ],
    { stdout: "inherit", stderr: "inherit" }
  );
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
} else {
  compile(target);
}
