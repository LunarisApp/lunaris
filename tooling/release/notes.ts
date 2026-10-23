import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [component, version, signingMode] = process.argv.slice(2);
if (
  (component !== "cli" && component !== "desktop") ||
  !version ||
  (signingMode !== "signed" && signingMode !== "adhoc")
) {
  throw new Error("Usage: notes.ts <cli|desktop> <version> <signed|adhoc>");
}

const root = resolve(import.meta.dir, "../..");
const changelogPath =
  component === "cli"
    ? resolve(root, "cli/CHANGELOG.md")
    : resolve(root, "apps/desktop/CHANGELOG.md");
const changelog = existsSync(changelogPath)
  ? readFileSync(changelogPath, "utf8")
  : "";
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const section =
  changelog
    .match(
      new RegExp(`^## ${escapedVersion}\\s*$([\\s\\S]*?)(?=^## \\S|\\s*$)`, "m")
    )?.[1]
    ?.trim() || "Initial private release.";
const sha =
  process.env.LUNARIS_BUILD_SHA ?? process.env.GITHUB_SHA ?? "unknown";
const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const repository = process.env.GITHUB_REPOSITORY ?? "LunarisApp/lunaris";
const runId = process.env.GITHUB_RUN_ID;
const workflowLink = runId
  ? `${serverUrl}/${repository}/actions/runs/${runId}`
  : "local build";

const signing =
  signingMode === "signed"
    ? "Developer ID signed and Apple-notarized."
    : [
        "**Ad-hoc signed; not notarized.**",
        "macOS may require explicit approval before opening this download.",
        "Do not disable Gatekeeper globally.",
      ].join("\n");

console.log(`# ${component === "cli" ? "Lunaris CLI" : "Lunaris Desktop"} ${version}

${section}

## Build

- macOS 13 or newer
- Universal Apple Silicon and Intel build
- Source commit: \`${sha}\`
- Signing: ${signing}
- Workflow: ${workflowLink}
`);
