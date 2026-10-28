import { afterEach, expect, spyOn, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deploySource, settle, type Destination } from "./railway";
import { lastSuccess } from "./github";
import { deployCore, deployImage } from "./core-deploy";
import type { Candidate } from "./candidate";

const originals = {
  PATH: process.env.PATH,
  GH_TOKEN: process.env.GH_TOKEN,
  GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
  FIXTURE_CALLS: process.env.FIXTURE_CALLS,
  FIXTURE_FAILURE: process.env.FIXTURE_FAILURE,
  FIXTURE_IMAGE: process.env.FIXTURE_IMAGE,
  RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN,
  RAILWAY_RELEASE_TARGETS: process.env.RAILWAY_RELEASE_TARGETS,
  POWERSYNC_API_SERVICE_ID: process.env.POWERSYNC_API_SERVICE_ID,
};
const roots: string[] = [];
let restoreFetch: (() => void) | undefined;
let restoreSpawn: (() => void) | undefined;
let restoreSleep: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreSpawn?.();
  restoreSleep?.();
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-delivery-"));
  roots.push(root);
  mkdirSync(join(root, "bin"));
  const calls = join(root, "calls.jsonl");
  writeFileSync(calls, "");
  const id = "11111111-1111-4111-8111-111111111111";
  writeFileSync(
    join(root, "bin/railway"),
    `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args)+"\\n");
if (args[0] === "variable" && process.env.FIXTURE_FAILURE === "variable") process.exit(1);
if (args[0] === "deployment" && process.env.FIXTURE_FAILURE === "preflight") process.exit(1);
if (args[0] === "up") {
  if (process.env.FIXTURE_FAILURE === "upload") process.exit(1);
  console.log(JSON.stringify({deploymentId:"${id}"}));
} else if (args[0] === "deployment") {
  const edits = readFileSync(process.env.FIXTURE_CALLS,"utf8").trim().split("\\n").map(JSON.parse).filter(args => args[0] === "environment").length;
  const id = process.env.FIXTURE_IMAGE ? "11111111-1111-4111-8111-"+String(edits).padStart(12,"0") : "${id}";
  console.log(JSON.stringify(process.env.FIXTURE_IMAGE && !edits ? [] : [{id,status:process.env.FIXTURE_FAILURE === "deployment" ? "FAILED" : "SUCCESS"}]));
}
else console.log("{}");
`,
    { mode: 0o755 }
  );
  process.env.PATH = `${join(root, "bin")}:${dirname(process.execPath)}:${originals.PATH}`;
  process.env.GH_TOKEN = "fixture";
  process.env.GITHUB_REPOSITORY = "fixture/repo";
  process.env.FIXTURE_CALLS = calls;
  const spawn = Bun.spawn.bind(Bun);
  const spawnMock = spyOn(Bun, "spawn").mockImplementation(((
    command: string[],
    options: object
  ) => {
    if (command[0] !== "railway") {
      throw new Error(`Unexpected command: ${command[0]}`);
    }
    return spawn(
      [process.execPath, join(root, "bin/railway"), ...command.slice(1)],
      { ...options, env: { ...process.env } }
    );
  }) as typeof Bun.spawn);
  restoreSpawn = () => spawnMock.mockRestore();
  const records: {
    id: number;
    sha: string;
    environment: string;
    payload: unknown;
  }[] = [];
  const state = new Map<number, { state: string; description: string }[]>();
  const sha = "a".repeat(40);
  const health = { sha, responses: [] as (string | Response | Error)[] };
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation((async (
    input: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1]
  ) => {
    const url = new URL(String(input));
    if (url.hostname === "fixture.test") {
      if (url.pathname === "/runtime-config.json") {
        return Response.json({ REGION_DIRECTORY_URL: "/regions.json" });
      }
      if (url.pathname === "/") {
        return new Response('<div id="root"></div>');
      }
      const response = health.responses.shift() ?? health.sha;
      if (response instanceof Error) {
        throw response;
      }
      if (response instanceof Response) {
        return response;
      }
      return new Response("ok", {
        headers: { "X-Lunaris-Commit": response },
      });
    }
    const path = url.pathname.replace("/repos/fixture/repo/", "");
    const statusId = path.match(/^deployments\/(\d+)\/statuses$/)?.[1];
    if (statusId) {
      const id = Number(statusId);
      if (options?.method === "POST") {
        state.set(id, [
          JSON.parse(String(options.body)),
          ...(state.get(id) ?? []),
        ]);
      }
      return Response.json(state.get(id) ?? []);
    }
    if (path === "deployments" && options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      const record = {
        id: records.length + 1,
        sha: body.ref,
        environment: body.environment,
        payload: body.payload,
      };
      records.unshift(record);
      return Response.json(record);
    }
    if (path === "deployments") {
      return Response.json(
        records.filter(
          (record) => record.environment === url.searchParams.get("environment")
        )
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch);
  restoreFetch = () => fetchMock.mockRestore();
  const destination: Destination = {
    project: id,
    environment: id,
    service: id,
    healthUrl: "https://fixture.test/health",
  };
  const uploads = () =>
    readFileSync(calls, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((args) => args[0] === "up");
  const edits = () =>
    readFileSync(calls, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((args) => args[0] === "environment");
  return { sha, destination, uploads, records, state, edits, health };
}
test("successful site attempts resume without another upload", async () => {
  const f = fixture();
  await deploySource("landing", f.sha, f.destination);
  await deploySource("landing", f.sha, f.destination);
  expect(f.uploads()).toHaveLength(1);
  expect(
    (await lastSuccess(`production/landing/${f.destination.service}`))?.sha
  ).toBe(f.sha);
});
test("site rollout waits for public routing to serve the expected revision", async () => {
  const f = fixture();
  const sleep = spyOn(Bun, "sleep").mockResolvedValue(undefined);
  restoreSleep = () => sleep.mockRestore();
  f.health.responses.push(
    "b".repeat(40),
    new Response("unavailable", { status: 503 }),
    new TypeError("fetch failed")
  );
  await deploySource("landing", f.sha, f.destination);
  expect(sleep).toHaveBeenCalledTimes(3);
  expect(f.uploads()).toHaveLength(1);
  expect(
    (await lastSuccess(`production/landing/${f.destination.service}`))?.sha
  ).toBe(f.sha);
});
test("persistent revision mismatch exhausts retries without recording success", async () => {
  const f = fixture();
  const sleep = spyOn(Bun, "sleep").mockResolvedValue(undefined);
  restoreSleep = () => sleep.mockRestore();
  f.health.sha = "b".repeat(40);
  await expect(deploySource("landing", f.sha, f.destination)).rejects.toThrow(
    `expected ${f.sha}, received ${f.health.sha}`
  );
  expect(sleep).toHaveBeenCalledTimes(11);
  expect(f.uploads()).toHaveLength(1);
  expect(
    await lastSuccess(`production/landing/${f.destination.service}`)
  ).toBeUndefined();
  expect(f.state.get(f.records[0]!.id)?.[0]?.state).toBe("error");
});
test("known provider failures create a fresh attempt on retry", async () => {
  const f = fixture();
  process.env.FIXTURE_FAILURE = "deployment";
  await expect(deploySource("docs", f.sha, f.destination)).rejects.toThrow(
    "FAILED"
  );
  expect(
    await lastSuccess(`production/docs/${f.destination.service}`)
  ).toBeUndefined();
  delete process.env.FIXTURE_FAILURE;
  await deploySource("docs", f.sha, f.destination);
  expect(f.uploads()).toHaveLength(2);
});

test("configuration failure before upload remains safely retryable", async () => {
  const f = fixture();
  process.env.FIXTURE_FAILURE = "variable";
  await expect(deploySource("landing", f.sha, f.destination)).rejects.toThrow(
    "variable failed"
  );
  expect(f.uploads()).toHaveLength(0);
  delete process.env.FIXTURE_FAILURE;
  await deploySource("landing", f.sha, f.destination);
  expect(f.uploads()).toHaveLength(1);
});
test("unknown uploads block replay on both the same and later source commits", async () => {
  const f = fixture();
  process.env.FIXTURE_FAILURE = "upload";
  await expect(deploySource("landing", f.sha, f.destination)).rejects.toThrow(
    "failed"
  );
  delete process.env.FIXTURE_FAILURE;
  await expect(deploySource("landing", f.sha, f.destination)).rejects.toThrow(
    "outcome unknown"
  );
  await expect(
    deploySource("landing", "b".repeat(40), f.destination)
  ).rejects.toThrow("unresolved");
  expect(f.uploads()).toHaveLength(1);
});

test("image retries preserve successful region records", async () => {
  const f = fixture();
  process.env.FIXTURE_IMAGE = "true";
  const image = {
    sha: f.sha,
    image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}`,
  };
  await deployImage("api", image, f.destination, "staging");
  await deployImage("api", image, f.destination, "staging");
  expect(f.edits()).toHaveLength(1);
  expect((await lastSuccess(`staging/api/${f.destination.service}`))?.sha).toBe(
    f.sha
  );
});

test("failed image attempts can deploy the same immutable image again", async () => {
  const f = fixture();
  process.env.FIXTURE_IMAGE = "true";
  process.env.FIXTURE_FAILURE = "deployment";
  const image = {
    sha: f.sha,
    image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}`,
  };
  await expect(
    deployImage("api", image, f.destination, "staging")
  ).rejects.toThrow("FAILED");
  delete process.env.FIXTURE_FAILURE;
  await deployImage("api", image, f.destination, "staging");
  expect(f.edits()).toHaveLength(2);
});

test("image preflight failure leaves no ambiguous deployment record", async () => {
  const f = fixture();
  process.env.FIXTURE_IMAGE = "true";
  process.env.FIXTURE_FAILURE = "preflight";
  const image = {
    sha: f.sha,
    image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}`,
  };
  await expect(
    deployImage("api", image, f.destination, "production")
  ).rejects.toThrow("deployment failed");
  expect(f.records).toHaveLength(0);
  delete process.env.FIXTURE_FAILURE;
  await deployImage("api", image, f.destination, "production");
  expect(f.edits()).toHaveLength(1);
});

test("rollback restores service images after a partially successful composition", async () => {
  const f = fixture();
  process.env.FIXTURE_IMAGE = "true";
  process.env.RAILWAY_API_TOKEN = "fixture";
  process.env.RAILWAY_RELEASE_TARGETS = JSON.stringify({
    api: [f.destination],
    web: [f.destination],
  });
  const candidate: Candidate = {
    schemaVersion: 1,
    sha: f.sha,
    runId: "1",
    configurationRevision: "v1",
    syncRevision: "a".repeat(64),
    api: { sha: f.sha, image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}` },
    web: { sha: f.sha, image: `ghcr.io/fixture/web@sha256:${"a".repeat(64)}` },
  };
  await deployCore(candidate, "production", "core", candidate);
  const baseline = f.edits().length;
  const changed = {
    sha: "b".repeat(40),
    image: `ghcr.io/fixture/api@sha256:${"b".repeat(64)}`,
  };
  f.health.sha = changed.sha;
  await deployImage("api", changed, f.destination, "production");
  f.health.sha = f.sha;
  await deployCore(candidate, "production", "core", candidate);
  expect(f.edits()).toHaveLength(baseline + 2);
  expect(
    (await lastSuccess(`production/api/${f.destination.service}`))?.sha
  ).toBe(candidate.api.sha);
});

test("historical success cannot hide a different live image", async () => {
  const f = fixture();
  process.env.FIXTURE_IMAGE = "true";
  const image = {
    sha: f.sha,
    image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}`,
  };
  await deployImage("api", image, f.destination, "production");
  f.health.responses.push("b".repeat(40));
  await deployImage("api", image, f.destination, "production");
  expect(f.edits()).toHaveLength(2);
});

test("web-only promotion rejects unresolved sync before any mutation", async () => {
  const f = fixture();
  const candidate: Candidate = {
    schemaVersion: 1,
    sha: f.sha,
    runId: "1",
    configurationRevision: "v1",
    syncRevision: "a".repeat(64),
    api: { sha: f.sha, image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}` },
    web: { sha: f.sha, image: `ghcr.io/fixture/web@sha256:${"a".repeat(64)}` },
  };
  await expect(
    deployCore(candidate, "production", "web", candidate, true)
  ).rejects.toThrow("combined core");
  expect(f.records).toHaveLength(0);
  expect(f.edits()).toHaveLength(0);
});

test("sync recovery preflights configuration even when confirmed revisions match", async () => {
  const f = fixture();
  process.env.RAILWAY_API_TOKEN = "fixture";
  process.env.RAILWAY_RELEASE_TARGETS = JSON.stringify({
    api: [f.destination],
    web: [f.destination],
  });
  delete process.env.POWERSYNC_API_SERVICE_ID;
  const candidate: Candidate = {
    schemaVersion: 1,
    sha: f.sha,
    runId: "1",
    configurationRevision: "v1",
    syncRevision: "a".repeat(64),
    api: { sha: f.sha, image: `ghcr.io/fixture/api@sha256:${"a".repeat(64)}` },
    web: { sha: f.sha, image: `ghcr.io/fixture/web@sha256:${"a".repeat(64)}` },
  };
  await expect(
    deployCore(candidate, "production", "core", candidate, true)
  ).rejects.toThrow("PowerSync target variables");
  expect(f.records).toHaveLength(0);
  expect(f.edits()).toHaveLength(0);
});

test("regional failure still waits for the remaining rollout", async () => {
  let finished = false;
  await expect(
    settle([
      Promise.reject(new Error("first region failed")),
      Bun.sleep(20).then(() => {
        finished = true;
      }),
    ])
  ).rejects.toThrow("Regional deployment failed");
  expect(finished).toBe(true);
});
