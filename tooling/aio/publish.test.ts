import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseRemoteTags } from "./remote";

const sha = "a".repeat(40);
const digest = (value: string) => `sha256:${value.repeat(64)}`;
const script = resolve("tooling/aio/publish.ts");

function publish(state: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "aio-publication-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  mkdirSync(join(root, ".context/aio-digests"), { recursive: true });
  for (const [arch, value] of [
    ["amd64", "b"],
    ["arm64", "c"],
  ]) {
    writeFileSync(join(root, `.context/aio-digests/${arch}`), digest(value!));
  }
  writeFileSync(join(root, "state.json"), JSON.stringify(state));
  const mock = `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const state = JSON.parse(readFileSync("state.json", "utf8"));
const sha = "a".repeat(40);
const digest = (letter) => "sha256:" + letter.repeat(64);
const index = { digest: digest("d"), manifests: ["amd64", "arm64"].map((architecture, i) => ({digest: digest(i ? "c" : "b"), platform: {os: "linux", architecture}})) };
const out = (value) => console.log(JSON.stringify(value));
if (process.argv[1].endsWith("/git")) {
  if (args.join(" ") !== "ls-remote --tags origin") throw new Error("Unexpected git command");
  if (!state.deleted) console.log((state.remoteSha || sha) + "\\trefs/tags/aio-v1.2.3");
} else {
  appendFileSync("calls.jsonl", JSON.stringify(args) + "\\n");
  const ref = args[3];
  if (args[2] === "create") {
    state.existing = true;
    writeFileSync("state.json", JSON.stringify(state));
  } else if (args[2] === "inspect") {
    if (ref.endsWith(":1.2.3")) {
      if (state.registryError) { console.error("unauthorized"); process.exit(1); }
      if (!state.existing) { console.error("not found"); process.exit(1); }
      out(index);
    } else if (args.at(-1) === "{{json .Image}}") {
      const architecture = ref.endsWith("b".repeat(64)) ? "amd64" : "arm64";
      out({os: "linux", architecture: state.wrongPlatform ? "amd64" : architecture, config: {Labels: {
        "org.opencontainers.image.revision": state.wrongSource ? "f".repeat(40) : sha,
        "org.opencontainers.image.version": "1.2.3"
      }}});
    } else {
      out({digest: ref.split("@")[1]});
    }
  } else throw new Error("Unexpected docker command");
}
`;
  for (const command of ["git", "docker"]) {
    writeFileSync(join(bin, command), mock, { mode: 0o755 });
  }
  try {
    const result = Bun.spawnSync([process.execPath, script], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AIO_TAG: "aio-v1.2.3",
        AIO_SHA: sha,
        GITHUB_STEP_SUMMARY: join(root, "summary.md"),
      },
    });
    let calls: string[][] = [];
    try {
      calls = readFileSync(join(root, "calls.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    } catch {
      /* Deleted tags must fail before registry access. */
    }
    return {
      status: result.exitCode,
      error: result.stderr.toString(),
      writes: calls.filter((call) => call[2] === "create"),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("first publication verifies staged platforms, writes version, then digest-pinned aliases", () => {
  const result = publish();
  expect(result.error).toBe("");
  expect(result.status).toBe(0);
  expect(result.writes).toHaveLength(2);
  expect(result.writes[0]).toEqual([
    "buildx",
    "imagetools",
    "create",
    "--tag",
    "lunarisapp/lunaris-aio:1.2.3",
    `lunarisapp/lunaris-aio@${digest("b")}`,
    `lunarisapp/lunaris-aio@${digest("c")}`,
  ]);
  expect(result.writes[1]?.at(-1)).toBe(
    `lunarisapp/lunaris-aio@${digest("d")}`
  );
  expect(result.writes[1]).not.toContain("lunarisapp/lunaris-aio:1.2.3");
});

test("retry preserves exact version and promotes its verified digest", () => {
  const result = publish({ existing: true });
  expect(result.status).toBe(0);
  expect(result.writes).toHaveLength(1);
  expect(result.writes[0]).not.toContain("lunarisapp/lunaris-aio:1.2.3");
  expect(result.writes[0]?.at(-1)).toBe(
    `lunarisapp/lunaris-aio@${digest("d")}`
  );
});

test("deleted or moved remote tags cannot publish", () => {
  for (const state of [{ deleted: true }, { remoteSha: "f".repeat(40) }]) {
    const result = publish(state);
    expect(result.status).not.toBe(0);
    expect(result.error).toContain("Release tag is missing or moved on origin");
    expect(result.writes).toHaveLength(0);
  }
});

test("wrong source, wrong architecture, and registry errors cannot publish", () => {
  for (const state of [
    { wrongSource: true },
    { wrongPlatform: true },
    { existing: true, wrongSource: true },
    { existing: true, wrongPlatform: true },
    { registryError: true },
  ]) {
    const result = publish(state);
    expect(result.status).not.toBe(0);
    expect(result.writes).toHaveLength(0);
  }
});

test("remote tag parsing resolves annotated tags to commits in either order", () => {
  const object = "b".repeat(40);
  const rows = [
    `${object}\trefs/tags/aio-v1.2.3`,
    `${sha}\trefs/tags/aio-v1.2.3^{}`,
    `${sha}\trefs/tags/aio-v2.0.0-rc.1`,
  ];
  for (const lines of [rows, [...rows].reverse()]) {
    const tags = parseRemoteTags(lines.join("\n"));
    expect(tags.size).toBe(2);
    expect(tags.get("aio-v1.2.3")).toBe(sha);
    expect(tags.get("aio-v2.0.0-rc.1")).toBe(sha);
  }
});
