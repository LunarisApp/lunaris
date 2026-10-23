import { readFileSync } from "node:fs";
import { assertCandidateRun, candidateSchema } from "./candidate";
import { github, statuses, verifyTrunk, type Deployment } from "./github";
import { output, run } from "../release/automation/process";

const runId = process.env.CANDIDATE_RUN_ID;
const rollbackId = process.env.ROLLBACK_DEPLOYMENT_ID;
if (rollbackId) {
  if (!/^\d+$/.test(rollbackId) || runId) {
    throw new Error("Choose candidate run or rollback record");
  }
  const record = await github<Deployment>(`deployments/${rollbackId}`);
  if (
    record.environment !== "production/core" ||
    (await statuses(record.id))[0]?.state !== "success"
  ) {
    throw new Error("Expected successful production deployment");
  }
  const candidate = candidateSchema.parse(record.payload);
  await Bun.write("artifacts/candidate.json", JSON.stringify(candidate));
  verifyTrunk(candidate.sha);
  output("sha", candidate.sha);
  output("mode", "rollback");
} else {
  if (!(runId && /^\d+$/.test(runId))) {
    throw new Error("Numeric candidate run ID required");
  }
  const info = await github<Parameters<typeof assertCandidateRun>[1]>(
    `actions/runs/${runId}`
  );
  // Authenticate the producer before downloading or checking out candidate content.
  if (
    info.head_branch !== "main" ||
    info.event !== "push" ||
    info.conclusion !== "success" ||
    info.path !== ".github/workflows/core.candidate.yml"
  ) {
    throw new Error("Untrusted candidate producer");
  }
  run("gh", [
    "run",
    "download",
    runId,
    "--name",
    "core-candidate",
    "--dir",
    "artifacts",
  ]);
  const candidate = candidateSchema.parse(
    JSON.parse(readFileSync("artifacts/candidate.json", "utf8"))
  );
  assertCandidateRun(candidate, info);
  const staged: unknown = JSON.parse(
    readFileSync("artifacts/staging.json", "utf8")
  );
  if (
    !staged ||
    typeof staged !== "object" ||
    !("deploymentId" in staged) ||
    !Number.isSafeInteger(staged.deploymentId)
  ) {
    throw new Error("Invalid staging receipt");
  }
  verifyTrunk(candidate.sha);
  output("sha", candidate.sha);
  output("staging", String(staged.deploymentId));
  output("mode", "promote");
}
