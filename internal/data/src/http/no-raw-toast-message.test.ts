import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guardrail: no call site may pass `error.message` (or `err.message`,
 * `result.error.message`, etc.) directly into a `toast.*` invocation. Doing
 * so bypasses the i18n contract enforced by `getUserFacingError` and leaks
 * server-locale strings into the UI. Use:
 *
 *   const ufe = getUserFacingError(err);
 *   toast.error(t(ufe.titleKey), {
 *     description: getUserFacingDescription(ufe, t),
 *   });
 *
 * If this test fails, migrate the offending call site instead of relaxing
 * the regex.
 */

const REPO_ROOT = resolve(__dirname, "../../../..");
const CLIENT_ROOTS = [
  "apps/desktop/src",
  "apps/web/src",
  "internal",
  "packages",
  "extensions",
].map((path) => resolve(REPO_ROOT, path));

// `toast.error(<anything>.message …)` — match across line breaks within the
// same call expression, allow whitespace and chained property accesses.
const FORBIDDEN = /toast\.\w+\([^)]*\b\w+(?:\.\w+)*\.message\b/;

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".turbo",
  "coverage",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (
      stat.isFile() &&
      ALLOWED_EXTENSIONS.has(`.${entry.split(".").pop() ?? ""}`) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".spec.ts")
    ) {
      yield full;
    }
  }
}

describe("toast call sites", () => {
  it("never pass raw error.message into toast.* (use getUserFacingError)", () => {
    const offenders: string[] = [];
    for (const root of CLIENT_ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        if (FORBIDDEN.test(src)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
