import { github, setStatus, type Deployment } from "./github";
import {
  destinations,
  TerminalDeploymentError,
  waitForDeployment,
} from "./railway";

const [recordId, providerId] = process.argv.slice(2);
if (
  !(/^\d+$/.test(recordId ?? "") && /^[a-f0-9-]{36}$/.test(providerId ?? ""))
) {
  throw new Error(
    "Usage: reconcile.ts GITHUB_DEPLOYMENT_ID RAILWAY_DEPLOYMENT_ID"
  );
}
const record = await github<Deployment>(`deployments/${recordId}`);
const [environment, component, service] = record.environment.split("/");
if (
  !(
    ["staging", "production"].includes(environment ?? "") &&
    component &&
    service
  )
) {
  throw new Error(
    "Select a service deployment, not an aggregate core/site record"
  );
}
const destination = destinations(component).find(
  (target) => target.service === service
);
if (!destination) {
  throw new Error("Railway destination does not match recorded deployment");
}
try {
  await waitForDeployment(destination, providerId!, record.sha);
  await setStatus(record.id, "success", `railway:${providerId}`);
} catch (error) {
  await setStatus(
    record.id,
    error instanceof TerminalDeploymentError ? "failure" : "error",
    `railway:${providerId}`
  );
  throw error;
}
