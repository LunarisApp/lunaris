import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderBootstrap } from "./bootstrap";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-bootstrap-"));
  roots.push(root);
  const source = join(root, "release");
  const bin = join(root, "bin");
  mkdirSync(source);
  mkdirSync(bin);
  writeFileSync(join(source, "release.json"), '{"version":"1.2.3"}');
  writeFileSync(join(source, "compose.yaml"), "name: fixture\n");
  writeFileSync(join(source, "powersync.yaml"), "port: 80\n", { mode: 0o644 });
  writeFileSync(
    join(source, "install.sh"),
    `#!/bin/bash
set -eu
cd -- "$(dirname -- "\${BASH_SOURCE[0]}")"
[[ -f .env ]] || printf 'SECRET=original\\n' > .env
if [[ \${TEST_SETUP_FAILURE:-0} == 1 ]]; then exit 42; fi
printf '%s' "\${TLS_MODE:-auto}" > tls-mode
printf '%s\\n' "\${1:-upgrade}" >> calls
`
  );
  const archive = join(root, "release.tar.gz");
  expect(spawnSync("tar", ["czf", archive, "-C", source, "."]).status).toBe(0);
  const digest = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  const curl = join(bin, "curl");
  writeFileSync(
    curl,
    `#!/bin/sh
if [ "\${TEST_DOWNLOAD_FAILURE:-0}" = 1 ]; then exit 22; fi
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    https://*) printf '%s\\n' "$1" > "$TEST_DOWNLOAD_URL"; shift ;;
    *) shift ;;
  esac
done
cp "$TEST_ARCHIVE" "$output"
`
  );
  chmodSync(curl, 0o755);
  const invoke = (
    args: string[],
    options: {
      checksum?: string;
      downloadFailure?: boolean;
      input?: string;
      cwd?: string;
      setupFailure?: boolean;
    } = {}
  ) =>
    spawnSync("bash", ["-s", "--", ...args], {
      cwd: options.cwd ?? root,
      input:
        options.input ?? renderBootstrap("1.2.3", options.checksum ?? digest),
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_ARCHIVE: archive,
        TEST_DOWNLOAD_URL: join(root, "download-url"),
        TEST_DOWNLOAD_FAILURE: options.downloadFailure ? "1" : "0",
        TEST_SETUP_FAILURE: options.setupFailure ? "1" : "0",
        TLS_MODE: undefined,
      },
    });
  return { root, invoke, directory: join(root, "lunaris") };
}

test("piped installer downloads pinned bundle, accepts spaces, preserves secrets on retry", () => {
  const { root, directory, invoke } = fixture();
  expect(invoke(["https://notes.example.com"]).status).toBe(0);
  expect(readFileSync(join(root, "download-url"), "utf8")).toContain(
    "/self-hosted%401.2.3/lunaris-self-hosted-1.2.3.tar.gz"
  );
  expect(existsSync(join(directory, ".bootstrap.lock"))).toBe(false);
  expect(statSync(join(directory, "powersync.yaml")).mode & 0o777).toBe(0o644);
  expect(statSync(join(directory, ".env")).mode & 0o777).toBe(0o600);
  const other = join(root, "installation with spaces");
  expect(invoke(["https://notes.example.com", "--dir", other]).status).toBe(0);
  writeFileSync(join(directory, ".env"), "SECRET=keep-me\n");
  expect(invoke([], { cwd: directory }).status).toBe(0);
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(
    "SECRET=keep-me\n"
  );
  expect(readFileSync(join(directory, "calls"), "utf8")).toBe(
    "https://notes.example.com\nupgrade\n"
  );
});

test("failed downloads and checksum mismatch leave installation unchanged and unlock retry", () => {
  const { directory, invoke } = fixture();
  expect(invoke(["https://notes.example.com"]).status).toBe(0);
  const before = readFileSync(join(directory, "calls"), "utf8");
  expect(invoke([], { downloadFailure: true }).status).not.toBe(0);
  const mismatch = invoke([], { checksum: "f".repeat(64) });
  expect(mismatch.status).not.toBe(0);
  expect(mismatch.stderr.toString()).toContain("checksum mismatch");
  expect(readFileSync(join(directory, "calls"), "utf8")).toBe(before);
  expect(existsSync(join(directory, ".bootstrap.lock"))).toBe(false);
  expect(invoke([]).status).toBe(0);
});

test("unrelated directory, active installer, and truncated pipe cannot start installation", () => {
  const { root, directory, invoke } = fixture();
  mkdirSync(directory);
  writeFileSync(join(directory, "unrelated"), "keep");
  expect(invoke(["https://notes.example.com"]).status).not.toBe(0);
  expect(existsSync(join(root, "download-url"))).toBe(false);
  rmSync(join(directory, "unrelated"));
  writeFileSync(join(directory, "release.json"), "{}");
  mkdirSync(join(directory, ".install.lock"));
  expect(invoke([]).status).not.toBe(0);
  rmSync(join(directory, ".install.lock"), { recursive: true });
  const partial = renderBootstrap("1.2.3", "a".repeat(64)).split(
    'main "$@"'
  )[0];
  invoke([], { input: partial });
  expect(existsSync(join(directory, "calls"))).toBe(false);
  expect(existsSync(join(root, "download-url"))).toBe(false);
});

test("setup failure propagates and retry preserves generated secrets", () => {
  const { directory, invoke } = fixture();
  expect(
    invoke(["https://notes.example.com"], { setupFailure: true }).status
  ).toBe(42);
  expect(existsSync(join(directory, ".bootstrap.lock"))).toBe(false);
  expect(invoke([], { cwd: directory }).status).toBe(0);
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(
    "SECRET=original\n"
  );
});

test("renderer rejects invalid release metadata", () => {
  expect(() => renderBootstrap("latest", "a".repeat(64))).toThrow();
  expect(() => renderBootstrap("1.2.3", "invalid")).toThrow();
});

test("piped installer forwards optional TLS mode and rejects invalid values", () => {
  const { root, directory, invoke } = fixture();
  const invalid = invoke(["--tls-mode", "invalid"]);
  expect(invalid.status).not.toBe(0);
  expect(existsSync(join(root, "download-url"))).toBe(false);
  expect(
    invoke(["--tls-mode", "external", "https://notes.example.com"]).status
  ).toBe(0);
  expect(readFileSync(join(directory, "tls-mode"), "utf8")).toBe("external");
});
