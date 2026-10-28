import {
  createDeployment,
  deployments,
  lastSuccess,
  setStatus,
  statuses,
} from "./github";
import {
  destinations,
  patchEnvironment,
  TerminalDeploymentError,
  railway,
  scope,
  settle,
  verifyHealth,
  waitForDeployment,
  type Destination,
} from "./railway";
import type { Candidate, CoreTarget } from "./candidate";
import { run, summary } from "../release/automation/process";
import { publicRuntimeConfigSchema } from "../../internal/app-shell/src/runtime-config";

export async function deployImage(
  component: "api" | "web",
  image: Candidate["api"],
  destination: Destination,
  environment: string
) {
  const recordEnvironment = `${environment}/${component}/${destination.service}`;
  const previousRecord = (await deployments(recordEnvironment))[0];
  if (previousRecord) {
    const status = (await statuses(previousRecord.id))[0];
    if (status && ["in_progress", "error"].includes(status.state)) {
      const providerId = status.description.match(
        /^railway:([a-f0-9-]{36})/
      )?.[1];
      if (!providerId) {
        throw new Error(
          `Image update outcome unknown: GitHub deployment ${previousRecord.id}; reconcile before retrying`
        );
      }
      try {
        await waitForDeployment(destination, providerId, previousRecord.sha);
        await setStatus(previousRecord.id, "success", `railway:${providerId}`);
      } catch (error) {
        if (error instanceof TerminalDeploymentError) {
          await setStatus(
            previousRecord.id,
            "failure",
            `railway:${providerId}`
          );
        } else {
          throw error;
        }
      }
    }
  }
  const successful = await lastSuccess(recordEnvironment);
  if (
    successful?.sha === image.sha &&
    (successful.payload as { image?: string }).image === image.image
  ) {
    try {
      await verifyHealth(destination, image.sha);
      return;
    } catch {
      // A failed composition or manual recovery may have replaced this image.
      // Restore the selected digest instead of trusting historical success.
    }
  }
  const previous = JSON.parse(
    await railway([
      "deployment",
      "list",
      ...scope(destination),
      "--limit",
      "1",
      "--json",
    ])
  ) as { id: string }[];
  const record = await createDeployment(recordEnvironment, image.sha, {
    image: image.image,
  });
  await setStatus(
    record.id,
    "in_progress",
    "Changing environment image; reconcile unknown outcomes"
  );
  await patchEnvironment(
    destination,
    {
      services: {
        [destination.service]: {
          // Environment edits merge fields: a retained repo takes precedence over
          // the image and rebuilds source with incompatible image entrypoints.
          source: {
            image: image.image,
            repo: null,
            branch: null,
            commitSha: null,
          },
          variables: {
            LUNARIS_BUILD_SHA: { value: image.sha },
            LUNARIS_DELIVERY_ATTEMPT: { value: String(record.id) },
          },
          deploy: {
            startCommand:
              component === "api" ? "bun dist/src/main.js" : "bun serve.js",
            preDeployCommand: component === "api" ? ["bun migrate.ts"] : [],
          },
        },
      },
    },
    `${component} ${image.sha}`
  );
  let id: string | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      const items = JSON.parse(
        await railway([
          "deployment",
          "list",
          ...scope(destination),
          "--limit",
          "10",
          "--json",
        ])
      ) as { id: string }[];
      id = items[0]?.id === previous[0]?.id ? undefined : items[0]?.id;
      if (id) {
        break;
      }
      await Bun.sleep(5000);
    }
    if (!id) {
      throw new Error(
        "Image update outcome unknown; reconcile Railway before retrying"
      );
    }
    await setStatus(record.id, "in_progress", `railway:${id}`);
    await waitForDeployment(destination, id, image.sha);
    await setStatus(record.id, "success", `railway:${id}`);
  } catch (error) {
    await setStatus(
      record.id,
      error instanceof TerminalDeploymentError ? "failure" : "error",
      id
        ? `railway:${id}`
        : "Image update outcome unknown; reconcile before retrying"
    );
    throw error;
  }
}

export async function deployCore(
  candidate: Candidate,
  environment: "staging" | "production",
  target: CoreTarget,
  previous: Candidate | undefined,
  recoverSync = false
) {
  const updateSync =
    target !== "web" &&
    (recoverSync || previous?.syncRevision !== candidate.syncRevision);
  if (target === "web" && recoverSync) {
    throw new Error("Unresolved sync rollout requires combined core promotion");
  }
  const api = destinations("api");
  const web = destinations("web");
  // Failed earlier rollouts may have changed a counterpart after the last full record.
  if (target === "web") {
    await settle(
      api.map((destination) => verifyHealth(destination, candidate.api.sha))
    );
  } else if (target === "api") {
    await settle(
      web.map((destination) => verifyWeb(destination, candidate.web.sha))
    );
  }
  if (updateSync) {
    if (
      ![
        "API_SERVICE_ID",
        "COMPACT_SERVICE_ID",
        "REPLICATION_SERVICE_ID",
        "PROJECT_ID",
        "ENVIRONMENT_ID",
      ].every((key) => process.env[`POWERSYNC_${key}`]?.trim())
    ) {
      throw new Error("PowerSync target variables are required");
    }
    if (
      !api.some(
        (destination) =>
          destination.project === process.env.POWERSYNC_PROJECT_ID &&
          destination.environment === process.env.POWERSYNC_ENVIRONMENT_ID
      )
    ) {
      throw new Error(
        "PowerSync target must belong to the selected API environment"
      );
    }
  }
  const record = await createDeployment(
    `${environment}/core`,
    candidate.sha,
    candidate
  );
  await setStatus(record.id, "in_progress", `Deploying ${target}`);
  try {
    await settle(
      (target === "web" ? [] : api).map(async (destination) => {
        await deployImage("api", candidate.api, destination, environment);
      })
    );
    if (updateSync) {
      run("bun", ["run", "powersync:config:deploy"], { inheritOutput: true });
    }
    await settle(
      (target === "api" ? [] : web).map(async (destination) => {
        await deployImage("web", candidate.web, destination, environment);
      })
    );
    await settle(
      web.map((destination) => verifyWeb(destination, candidate.web.sha))
    );
    await setStatus(record.id, "success", `${target} verified`);
    summary(
      `${environment}: ${candidate.sha}; target ${target}; record ${record.id}`
    );
    return record.id;
  } catch (error) {
    await setStatus(record.id, "failure", String(error));
    throw error;
  }
}

async function verifyWeb(destination: Destination, sha: string) {
  await verifyHealth(destination, sha);
  const origin = new URL(destination.healthUrl).origin;
  const config = await fetch(`${origin}/runtime-config.json`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (
    !(
      config.ok &&
      publicRuntimeConfigSchema.parse(await config.json()).REGION_DIRECTORY_URL
    )
  ) {
    throw new Error(`Invalid public runtime configuration: ${origin}`);
  }
  const page = await fetch(origin, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!(page.ok && (await page.text()).includes('id="root"'))) {
    throw new Error(`Web smoke check failed: ${origin}`);
  }
}
