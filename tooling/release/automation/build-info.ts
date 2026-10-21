import { existsSync, readFileSync, writeFileSync } from "node:fs";

const files: Record<string, string> = {
  api: "apps/api/libs/health/src/build-info.ts",
  web: "apps/web/build-info.ts",
  docs: "apps/docs/app/health/build-info.ts",
  landing: "apps/landing/src/app/health/build-info.ts",
};

/** Stamp only the upload snapshot; always restore the checked-out source. */
export function withBuildInfo<T>(
  name: string,
  sha: string,
  version: string,
  upload: () => T
): T {
  const path = files[name];
  if (!(path && /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error("Invalid hosted build metadata");
  }
  const previous = existsSync(path) ? readFileSync(path, "utf8") : null;
  // Older releases may lack metadata support. Publication tools from this revision
  // must only deploy sources containing the corresponding health integration.
  if (previous === null) {
    throw new Error(`Missing build metadata input: ${path}`);
  }
  try {
    writeFileSync(
      path,
      `export const buildInfo = ${JSON.stringify({ sha, version })};\n`
    );
    return upload();
  } finally {
    writeFileSync(path, previous);
  }
}
