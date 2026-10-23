import { github, verifyTrunk } from "./github";
import { git } from "../release/automation/process";

const sha = git("rev-parse", "HEAD");
verifyTrunk(sha);
const checks = await github<{
  check_runs: { name: string; conclusion: string; app: { slug: string } }[];
}>(`commits/${sha}/check-runs?check_name=CI&filter=latest&per_page=100`);
if (
  !checks.check_runs.some(
    (check) =>
      check.name === "CI" &&
      check.app.slug === "github-actions" &&
      check.conclusion === "success"
  )
) {
  throw new Error(
    "Native publication requires successful CI on the exact trunk SHA"
  );
}
