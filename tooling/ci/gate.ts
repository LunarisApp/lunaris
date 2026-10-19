import { checks, optionalJobs } from "../ci-selection";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return every failed requirement so one CI run explains all blockers. */
export function evaluateCI(
  needs: unknown,
  event: string,
  e2eRequired: boolean
): string[] {
  if (!isRecord(needs)) {
    return ["Invalid needs: expected an object"];
  }
  const errors: string[] = [];
  const result = (name: string) => {
    const job = needs[name];
    return isRecord(job) ? job.result : undefined;
  };
  const requireSuccess = (name: string) => {
    if (result(name) !== "success") {
      errors.push(`Required job ${name} did not succeed`);
    }
  };
  for (const name of ["changes", "quality", "typecheck", "test"]) {
    requireSuccess(name);
  }
  for (const [name, job] of Object.entries(needs)) {
    if (
      !(isRecord(job) && (job.result === "success" || job.result === "skipped"))
    ) {
      errors.push(`Job ${name} has invalid or unsuccessful result`);
    }
  }
  const changes = needs.changes;
  const outputs = isRecord(changes) ? changes.outputs : undefined;
  for (const name of checks) {
    const selected = isRecord(outputs) ? outputs[name] : undefined;
    if (selected !== "true" && selected !== "false") {
      errors.push(`Missing or invalid selection: ${name}`);
    }
  }
  for (const name of optionalJobs) {
    if (isRecord(outputs) && outputs[name] === "true") {
      requireSuccess(name);
    }
  }
  if (event === "pull_request") {
    requireSuccess("release-policy");
  }
  if (e2eRequired) {
    requireSuccess("e2e");
  }
  return errors;
}

if (import.meta.main) {
  const { NEEDS_JSON, EVENT, E2E_REQUIRED } = process.env;
  if (
    !(NEEDS_JSON && EVENT && ["true", "false"].includes(E2E_REQUIRED ?? ""))
  ) {
    throw new Error("NEEDS_JSON, EVENT, and boolean E2E_REQUIRED are required");
  }
  const errors = evaluateCI(
    JSON.parse(NEEDS_JSON),
    EVENT,
    E2E_REQUIRED === "true"
  );
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
}
