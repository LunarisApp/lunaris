import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { affectedComponents, changedFiles } from "./affected";
import {
  candidateSchema,
  assertCandidateRun,
  resultingCandidate,
  type Candidate,
} from "./candidate";
import {
  github,
  lastSuccess,
  statuses,
  verifyTrunk,
  type Deployment,
} from "./github";
import { deployCore } from "./core-deploy";
import {
  assertRollbackSafe,
  needsSyncRecovery,
  readCoreState,
} from "./core-state";
import { git, output, run } from "../release/automation/process";

const mode = process.argv[2];
const sha = git("rev-parse", "HEAD");
const file = "artifacts/candidate.json";
const configurationRevision = process.env.CORE_CONFIGURATION_REVISION;
const syncRevision = createHash("sha256")
  .update(readFileSync("infra/local/config/powersync.yaml"))
  .update(readFileSync("infra/local/config/sync_rules.yaml"))
  .digest("hex");
const readCandidate = () =>
  candidateSchema.parse(JSON.parse(readFileSync(file, "utf8")));
function recordCandidate(
  record: Deployment | undefined
): Candidate | undefined {
  return record ? candidateSchema.parse(record.payload) : undefined;
}
function save(value: unknown) {
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

if (mode === "plan") {
  verifyTrunk(sha);
  if (!configurationRevision) {
    throw new Error("CORE_CONFIGURATION_REVISION required");
  }
  const previous = recordCandidate(await lastSuccess("staging/core"));
  const affected = previous
    ? affectedComponents(changedFiles(previous.sha, sha))
    : ["api", "web"];
  const coreChanged =
    affected.includes("api") ||
    affected.includes("web") ||
    previous?.syncRevision !== syncRevision ||
    previous?.configurationRevision !== configurationRevision;
  output(
    "enabled",
    String(
      coreChanged ||
        affected.some((name) =>
          ["cli", "desktop", "self-hosted"].includes(name)
        )
    )
  );
  const build = {
    api: !previous || affected.includes("api"),
    web: !previous || affected.includes("web"),
  };
  const candidate = {
    schemaVersion: 1,
    sha,
    runId: process.env.GITHUB_RUN_ID,
    api: previous?.api,
    web: previous?.web,
    syncRevision,
    configurationRevision,
    build,
  };
  save(candidate);
} else if (mode === "images") {
  const planned = JSON.parse(readFileSync(file, "utf8")) as Candidate & {
    build: { api: boolean; web: boolean };
  };
  const registry = `ghcr.io/${process.env.GITHUB_REPOSITORY?.toLowerCase()}`;
  for (const component of ["api", "web"] as const) {
    if (!planned.build[component]) {
      continue;
    }
    const repository = `${registry}-hosted-${component}`;
    run(
      "docker",
      [
        "buildx",
        "build",
        "-f",
        "infra/self-host/Dockerfile",
        "--target",
        `hosted-${component}`,
        "--platform",
        "linux/amd64",
        "--build-arg",
        "LUNARIS_EDITION=enterprise",
        "--build-arg",
        "LUNARIS_RUNTIME_CONFIG=true",
        "--build-arg",
        `LUNARIS_BUILD_SHA=${sha}`,
        "--label",
        `org.opencontainers.image.revision=${sha}`,
        "--label",
        `org.opencontainers.image.source=https://github.com/${process.env.GITHUB_REPOSITORY}`,
        "--cache-from",
        "type=gha,scope=hosted-enterprise-amd64",
        "--cache-to",
        "type=gha,scope=hosted-enterprise-amd64,mode=max",
        "--tag",
        `${repository}:${sha}`,
        "--metadata-file",
        `artifacts/${component}.json`,
        "--push",
        ".",
      ],
      { inheritOutput: true }
    );
    const metadata = JSON.parse(
      readFileSync(`artifacts/${component}.json`, "utf8")
    );
    planned[component] = {
      sha,
      image: `${repository}@${metadata["containerimage.digest"]}`,
    };
  }
  delete (planned as Partial<typeof planned>).build;
  const candidate = candidateSchema.parse(planned);
  save(candidate);
  output(
    "images",
    JSON.stringify({ api: candidate.api.image, web: candidate.web.image })
  );
} else if (mode === "stage") {
  const candidate = readCandidate();
  verifyTrunk(candidate.sha);
  if (candidate.sha !== sha || candidate.runId !== process.env.GITHUB_RUN_ID) {
    throw new Error("Staging candidate source mismatch");
  }
  const state = await readCoreState("staging");
  for (const baseline of [state.current, ...state.pending]) {
    if (baseline) {
      git("merge-base", "--is-ancestor", baseline.sha, candidate.sha);
    }
  }
  const deploymentId = await deployCore(
    candidate,
    "staging",
    "core",
    state.current,
    needsSyncRecovery(state, candidate)
  );
  writeFileSync("artifacts/staging.json", JSON.stringify({ deploymentId }));
} else if (mode === "promote" || mode === "rollback") {
  const target = process.env.CORE_TARGET;
  if (target !== "api" && target !== "web" && target !== "core") {
    throw new Error("Expected api, web or core target");
  }
  const state = await readCoreState("production");
  const previous = state.current;
  let candidate = readCandidate();
  if (mode === "promote") {
    const runInfo = await github<Parameters<typeof assertCandidateRun>[1]>(
      `actions/runs/${candidate.runId}`
    );
    assertCandidateRun(candidate, runInfo);
    for (const baseline of [state.current, ...state.pending]) {
      if (baseline) {
        git("merge-base", "--is-ancestor", baseline.sha, candidate.sha);
      }
    }
    const stage = await github<Deployment>(
      `deployments/${process.env.STAGING_DEPLOYMENT_ID}`
    );
    if (
      stage.environment !== "staging/core" ||
      JSON.stringify(candidateSchema.parse(stage.payload)) !==
        JSON.stringify(candidate) ||
      (await statuses(stage.id))[0]?.state !== "success"
    ) {
      throw new Error("Staging candidate was not successfully deployed");
    }
  } else {
    const record = await github<Deployment>(
      `deployments/${process.env.ROLLBACK_DEPLOYMENT_ID}`
    );
    if (
      record.environment !== "production/core" ||
      (await statuses(record.id))[0]?.state !== "success"
    ) {
      throw new Error("Rollback must select a successful production record");
    }
    candidate = candidateSchema.parse(record.payload);
    assertRollbackSafe(state, candidate);
  }
  verifyTrunk(candidate.sha);
  if (configurationRevision !== candidate.configurationRevision) {
    throw new Error(
      "Production configuration revision differs from tested candidate"
    );
  }
  // A partial promotion is allowed only when unchanged counterparts match the tested composition.
  candidate = resultingCandidate(candidate, previous, target);
  // PowerSync configuration comes from candidate source, never the current workflow revision.
  if (git("rev-parse", "HEAD") !== candidate.sha) {
    throw new Error("Check out candidate SHA before promotion");
  }
  await deployCore(
    candidate,
    "production",
    target,
    previous,
    needsSyncRecovery(state, candidate)
  );
} else {
  throw new Error("Expected plan, images, stage, promote or rollback");
}
