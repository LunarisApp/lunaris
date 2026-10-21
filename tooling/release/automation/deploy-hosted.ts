import { withBuildInfo } from "./build-info";
import { verifyHostedHealth } from "./health";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { verifyPublicationCommit } from "./manifest";
import { run, summary } from "./process";
import { parseRailwayUpload, RailwayPackagingError } from "./railway-upload";

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
if (hosted.length && !process.env.RAILWAY_API_TOKEN?.trim()) {
  throw new Error(
    "Missing RAILWAY_API_TOKEN; configure RAILWAY_RELEASE_TOKEN before deploying"
  );
}
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
    summary(
      `${entry.tag}: deployment pending; expected ${sha}; health ${destination.healthUrl}`
    );
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
    if (
      !attempt ||
      ["FAILED", "CRASHED", "PACKAGING_FAILED"].includes(attempt.status)
    ) {
      const uploadAttempt: Receipt["attempts"][number] = {
        deploymentId: null,
        status: "UPLOADING",
      };
      attempt = uploadAttempt;
      const upload = withBuildInfo(name, sha, entry.version, () => {
        receipt.attempts.push(uploadAttempt);
        save();
        return run(
          "railway",
          [
            "up",
            ...scope,
            "--detach",
            "--json",
            "--message",
            `${entry.tag} ${sha}`,
          ],
          { allowFailure: true }
        );
      });
      try {
        attempt.deploymentId = parseRailwayUpload(upload);
      } catch (error) {
        if (error instanceof RailwayPackagingError) {
          attempt.status = "PACKAGING_FAILED";
          save();
        }
        throw error;
      }
      attempt.status = "QUEUED";
      save();
      summary(
        `${entry.tag}: deployment ${attempt.deploymentId} QUEUED; expected ${sha}; health pending`
      );
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
        try {
          await verifyHostedHealth(
            destination.healthUrl,
            sha,
            entry.version,
            name === "landing"
          );
        } catch (error) {
          save();
          summary(
            `${entry.tag}: verification FAILED; expected ${sha}; deployment ${attempt.deploymentId}; ${String(error)}; recover via https://github.com/${process.env.GITHUB_REPOSITORY}/actions/workflows/release.publish.yml`
          );
          throw error;
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
        summary(
          `${entry.tag}: deployment ${attempt.deploymentId} ${deployment.status}; expected ${sha}; health not verified`
        );
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
