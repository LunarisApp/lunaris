import { github, verifyTrunk } from "./github";
import { output } from "../release/automation/process";

const sha = process.env.NATIVE_SOURCE_SHA;
if (!sha) {
  throw new Error("Native source SHA required");
}
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
// Release jobs consume only the result of this trusted gate.
output("validated_revision", sha);
