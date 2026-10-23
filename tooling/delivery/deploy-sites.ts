import { affectedComponents, changedFiles } from "./affected";
import {
  createDeployment,
  lastSuccess,
  setStatus,
  verifyTrunk,
} from "./github";
import { deploySource, destinations, settle } from "./railway";
import { git, output, summary } from "../release/automation/process";
import { smokeLanding } from "../release/automation/landing-smoke";

const component = process.argv[2];
if (component !== "landing" && component !== "docs") {
  throw new Error("Expected landing or docs");
}
const sha = git("rev-parse", "HEAD");
verifyTrunk(sha);
const previous = await lastSuccess(`production/${component}`);
const stale = previous && !gitIsAncestor(previous.sha, sha);
function gitIsAncestor(base: string, head: string) {
  return (
    Bun.spawnSync(["git", "merge-base", "--is-ancestor", base, head])
      .exitCode === 0
  );
}
const enabled =
  !stale &&
  (!previous ||
    affectedComponents(changedFiles(previous.sha, sha)).includes(component));
if (process.argv.includes("--plan")) {
  output("enabled", String(enabled));
  process.exit(0);
}
// No recorded baseline means first deployment must run; failed attempts never advance it.
if (!enabled && previous) {
  summary(`${component}: no changes since ${previous.sha}`);
} else {
  const targets = destinations(component);
  const deployment = await createDeployment(`production/${component}`, sha, {
    component,
  });
  await setStatus(
    deployment.id,
    "in_progress",
    "Deploying selected destinations"
  );
  try {
    await settle(targets.map((target) => deploySource(component, sha, target)));
    if (component === "landing") {
      await settle(targets.map((target) => smokeLanding(target.healthUrl)));
    }
    await setStatus(deployment.id, "success", `Deployed ${component} ${sha}`);
    summary(`${component}: deployed ${sha}; record ${deployment.id}`);
  } catch (error) {
    await setStatus(deployment.id, "failure", String(error));
    throw error;
  }
}
