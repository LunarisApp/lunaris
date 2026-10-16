import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { verifyPublicationCommit } from "./manifest";
import { run, summary } from "./process";

interface Destination {
  environment: string;
  healthUrl: string;
  project: string;
  service: string;
}
interface Receipt {
  attempts: { deploymentId: string | null; status: string }[];
  sha: string;
  tag: string;
}
interface Deployment {
  id: string;
  status: string;
}
const { sha, manifest } = verifyPublicationCommit();
const destinations = JSON.parse(
  process.env.RAILWAY_RELEASE_TARGETS ?? "{}"
) as Record<string, Destination[]>;
const hosted = manifest.releases.filter((entry) => entry.kind === "hosted");
// Validate every destination before starting any deployment.
for (const entry of hosted) {
  const list = destinations[entry.name];
  if (!list?.length) {
    throw new Error(`Missing Railway destinations for ${entry.name}`);
  }
  for (const destination of list) {
    if (
      !(
        [
          destination.project,
          destination.environment,
          destination.service,
        ].every((id) => /^[a-f0-9-]{36}$/.test(id)) &&
        destination.healthUrl?.startsWith("https://")
      )
    ) {
      throw new Error(`Invalid Railway destination for ${entry.name}`);
    }
  }
}
for (const name of ["api", "web", "docs", "landing"]) {
  const entry = hosted.find((release) => release.name === name);
  if (!entry) {
    continue;
  }
  for (const destination of destinations[name] ?? []) {
    const scope = [
      "--project",
      destination.project,
      "--environment",
      destination.environment,
      "--service",
      destination.service,
    ];
    const receiptName = `railway-${destination.service}.json`;
    const receiptPath = `${process.env.RUNNER_TEMP ?? "/tmp"}/${receiptName}`;
    const assets = JSON.parse(
      run("gh", ["release", "view", entry.tag, "--json", "assets"]).text
    ) as { assets: { name: string }[] };
    if (assets.assets.some((asset) => asset.name === receiptName)) {
      run("gh", [
        "release",
        "download",
        entry.tag,
        "--pattern",
        receiptName,
        "--output",
        receiptPath,
        "--clobber",
      ]);
    }
    const receipt: Receipt = existsSync(receiptPath)
      ? JSON.parse(readFileSync(receiptPath, "utf8"))
      : { sha, tag: entry.tag, attempts: [] };
    if (receipt.sha !== sha || receipt.tag !== entry.tag) {
      throw new Error("Deployment receipt source mismatch");
    }
    const save = () => {
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      run("gh", ["release", "upload", entry.tag, receiptPath, "--clobber"]);
    };
    let attempt = receipt.attempts.at(-1);
    if (!attempt || ["FAILED", "CRASHED"].includes(attempt.status)) {
      attempt = { deploymentId: null, status: "UPLOADING" };
      receipt.attempts.push(attempt);
      save();
      const upload = JSON.parse(
        run("railway", [
          "up",
          ...scope,
          "--detach",
          "--json",
          "--message",
          `${entry.tag} ${sha}`,
        ]).text
      ) as { deploymentId: string };
      if (!upload.deploymentId) {
        throw new Error(
          "Railway did not return a deployment ID; inspect deployment history before retrying"
        );
      }
      attempt.deploymentId = upload.deploymentId;
      attempt.status = "QUEUED";
      save();
    }
    if (!attempt.deploymentId) {
      throw new Error(
        "Upload outcome unknown; reconcile Railway history and receipt before retrying"
      );
    }
    for (let poll = 0; poll < 180; poll++) {
      const deployments = JSON.parse(
        run("railway", [
          "deployment",
          "list",
          ...scope,
          "--limit",
          "100",
          "--json",
        ]).text
      ) as Deployment[];
      const deployment = deployments.find(
        ({ id }) => id === attempt.deploymentId
      );
      if (!deployment) {
        throw new Error(
          `Deployment ${attempt.deploymentId} missing; reconcile before retrying`
        );
      }
      attempt.status = deployment.status;
      if (deployment.status === "SUCCESS") {
        const health = await fetch(destination.healthUrl, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!health.ok) {
          throw new Error(
            `Smoke check failed: ${destination.healthUrl}: ${health.status}`
          );
        }
        save();
        summary(
          `${entry.tag}: ${attempt.deploymentId} SUCCESS; source ${sha}; ${destination.healthUrl}`
        );
        break;
      }
      if (
        ![
          "QUEUED",
          "INITIALIZING",
          "WAITING",
          "BUILDING",
          "DEPLOYING",
        ].includes(deployment.status)
      ) {
        save();
        throw new Error(
          `${entry.tag}: ${attempt.deploymentId} ended with ${deployment.status}`
        );
      }
      if (poll === 179) {
        save();
        throw new Error(`Timed out: ${attempt.deploymentId}`);
      }
      await Bun.sleep(10_000);
    }
  }
  // API migration hooks finish before sync configuration, then clients deploy.
  if (name === "api") {
    run("bun", ["run", "powersync:config:deploy"]);
  }
  // Promote only this verified target; unrelated failures keep their drafts.
  run("gh", ["release", "edit", entry.tag, "--draft=false", "--latest=false"]);
  summary(`Released ${entry.tag}; source ${sha}`);
}
