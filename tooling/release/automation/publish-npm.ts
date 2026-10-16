import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyPublicationCommit } from "./manifest";
import { ensureNpmPublication, inspectNpmIntegrity } from "./npm-registry";
import { run, summary } from "./process";

const { sha, manifest } = verifyPublicationCommit();
for (const entry of manifest.releases.filter(
  (release) => release.kind === "npm"
)) {
  const packed = JSON.parse(
    run("npm", ["pack", "--json"], { cwd: entry.path }).text
  ) as { filename: string }[];
  const filename = packed[0]?.filename;
  if (!filename) {
    throw new Error(`npm pack returned no archive for ${entry.name}`);
  }
  const bytes = readFileSync(`${entry.path}/${filename}`);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const url = `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${entry.version}`;
  await ensureNpmPublication(
    entry.tag,
    integrity,
    (signal) => inspectNpmIntegrity(url, signal),
    () => {
      run(
        "npm",
        [
          "publish",
          filename,
          "--access",
          "public",
          "--tag",
          "latest",
          "--provenance",
        ],
        { cwd: entry.path, inheritOutput: true }
      );
    }
  );
  summary(
    `Published/verified ${entry.tag}; source ${sha}; integrity ${integrity}`
  );
}
