import { createDeployment, deployments, setStatus, statuses } from "./github";
import { parseRailwayUpload } from "../release/automation/railway-upload";
import { z } from "zod";

export const destinationSchema = z.object({
  project: z.string().uuid(),
  environment: z.string().uuid(),
  service: z.string().uuid(),
  healthUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://")),
});
export type Destination = z.infer<typeof destinationSchema>;
export function destinations(component: string): Destination[] {
  if (!process.env.RAILWAY_API_TOKEN?.trim()) {
    throw new Error("RAILWAY_API_TOKEN is required before deployment");
  }
  const value = JSON.parse(process.env.RAILWAY_RELEASE_TARGETS ?? "{}");
  return z.array(destinationSchema).min(1).parse(value[component]);
}
export async function railway(
  args: string[],
  input?: unknown
): Promise<string> {
  const child = Bun.spawn(["railway", ...args], {
    stdin: input === undefined ? "ignore" : new Blob([JSON.stringify(input)]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exit !== 0) {
    throw new Error(`Railway ${args[0]} failed: ${stderr.slice(0, 500)}`);
  }
  return stdout;
}
export const scope = (destination: Destination) => [
  "--project",
  destination.project,
  "--environment",
  destination.environment,
  "--service",
  destination.service,
];

export async function verifyHealth(destination: Destination, sha?: string) {
  const response = await fetch(destination.healthUrl, {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (
    !response.ok ||
    (sha && response.headers.get("X-Lunaris-Commit") !== sha)
  ) {
    throw new Error(
      `Health/revision check failed for ${destination.healthUrl}`
    );
  }
}

export class TerminalDeploymentError extends Error {}

export async function waitForDeployment(
  destination: Destination,
  id: string,
  sha?: string
) {
  for (let attempt = 0; attempt < 180; attempt++) {
    const items = JSON.parse(
      await railway([
        "deployment",
        "list",
        ...scope(destination),
        "--limit",
        "100",
        "--json",
      ])
    ) as { id: string; status: string }[];
    const deployment = items.find((item) => item.id === id);
    if (!deployment) {
      throw new Error(`Deployment ${id} missing; reconcile before retrying`);
    }
    if (deployment.status === "SUCCESS") {
      await verifyHealth(destination, sha);
      return;
    }
    if (
      !["QUEUED", "INITIALIZING", "WAITING", "BUILDING", "DEPLOYING"].includes(
        deployment.status
      )
    ) {
      throw new TerminalDeploymentError(
        `Deployment ${id}: ${deployment.status}`
      );
    }
    await Bun.sleep(10_000);
  }
  throw new Error(
    `Deployment ${id} timed out; inspect Railway before retrying`
  );
}

/** A durable preflight record prevents replaying an upload with an unknown outcome. */
export async function deploySource(
  component: string,
  sha: string,
  destination: Destination
): Promise<string> {
  const environment = `production/${component}/${destination.service}`;
  const history = await deployments(environment);
  const latest = history[0];
  if (
    latest &&
    latest.sha !== sha &&
    ["in_progress", "error"].includes(
      (await statuses(latest.id))[0]?.state ?? ""
    )
  ) {
    throw new Error(
      `Previous upload outcome unresolved: GitHub deployment ${latest.id}`
    );
  }
  const previous = history.find((entry) => entry.sha === sha);
  let deployment = previous;
  let providerId: string | undefined;
  if (previous) {
    const status = (await statuses(previous.id))[0];
    providerId =
      status?.state === "failure"
        ? undefined
        : status?.description.match(/^railway:([a-f0-9-]{36})/)?.[1];
    if (!providerId && status?.state !== "failure") {
      throw new Error(
        `Upload outcome unknown: GitHub deployment ${previous.id}; reconcile before retrying`
      );
    }
  }
  if (!providerId) {
    deployment = await createDeployment(environment, sha, {
      component,
      runId: process.env.GITHUB_RUN_ID,
    });
    await setStatus(
      deployment.id,
      "in_progress",
      "Uploading source; reconcile if outcome unknown"
    );
    try {
      await railway([
        "variable",
        "set",
        ...scope(destination),
        "--skip-deploys",
        `LUNARIS_BUILD_SHA=${sha}`,
      ]);
    } catch (error) {
      await setStatus(
        deployment.id,
        "failure",
        "Configuration failed before source upload"
      );
      throw error;
    }
    const text = await railway([
      "up",
      ...scope(destination),
      "--detach",
      "--json",
      "--message",
      `${component} ${sha}`,
    ]);
    providerId = parseRailwayUpload({ ok: true, text, stderr: "" });
    await setStatus(deployment.id, "in_progress", `railway:${providerId}`);
  }
  if (!deployment) {
    throw new Error("Missing deployment record");
  }
  try {
    await waitForDeployment(destination, providerId, sha);
    await setStatus(deployment.id, "success", `railway:${providerId}`);
    return providerId;
  } catch (error) {
    await setStatus(
      deployment.id,
      error instanceof TerminalDeploymentError ? "failure" : "error",
      `railway:${providerId}`
    );
    throw error;
  }
}

/** Do not leave other regions running when one region fails. */
export async function settle(attempts: Promise<unknown>[]) {
  const results = await Promise.allSettled(attempts);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Regional deployment failed"
    );
  }
}
