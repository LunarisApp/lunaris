import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import {
  productVersion,
  productPlanSchema,
  assetReceiptSchema,
  assertSamePlan,
  type ProductPlan,
} from "./product";
import { git, output, run, summary } from "../release/automation/process";
import {
  github,
  lastSuccess,
  statuses,
  deployments,
  createDeployment,
  setStatus,
  type Deployment,
} from "./github";

const mode = process.argv[2];
const work = resolve("artifacts/product");
mkdirSync(work, { recursive: true });
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  throw new Error("GITHUB_REPOSITORY required");
}
interface Release {
  assets: { name: string }[];
  draft: boolean;
  tag_name: string;
}
function release(tag: string): Release {
  return JSON.parse(
    run("gh", ["api", `repos/${repository}/releases/tags/${tag}`]).text
  );
}
function download(tag: string, name: string, directory = work) {
  mkdirSync(directory, { recursive: true });
  run("gh", [
    "release",
    "download",
    tag,
    "--pattern",
    name,
    "--dir",
    directory,
    "--clobber",
  ]);
  return resolve(directory, name);
}
function upload(tag: string, path: string) {
  if (release(tag).assets.some((asset) => asset.name === basename(path))) {
    const previous = download(tag, basename(path), resolve(work, "previous"));
    if (hash(previous) !== hash(path)) {
      throw new Error(`Existing release asset differs: ${basename(path)}`);
    }
  } else {
    run("gh", ["release", "upload", tag, path]);
  }
}
function readPlan(tag: string) {
  const plan = productPlanSchema.parse(
    JSON.parse(readFileSync(download(tag, "release-plan.json"), "utf8"))
  );
  const ref = JSON.parse(
    run("gh", ["api", `repos/${repository}/git/ref/tags/${tag}`]).text
  );
  if (
    ref.object.type !== "commit" ||
    ref.object.sha !== plan.candidate.sha ||
    tag !== `v${plan.version}`
  ) {
    throw new Error("Product tag differs from reservation");
  }
  return plan;
}
function tagFromEnvironment() {
  const version = process.env.PRODUCT_VERSION;
  if (!(version && /^\d+\.\d+\.\d+$/.test(version))) {
    throw new Error("PRODUCT_VERSION required");
  }
  return `v${version}`;
}
function verifySource(plan: ProductPlan) {
  if (git("rev-parse", "HEAD") !== plan.candidate.sha) {
    throw new Error("Product source does not match reservation");
  }
}
if (mode === "reserve") {
  const candidate = JSON.parse(
    readFileSync("artifacts/candidate.json", "utf8")
  );
  const staging = JSON.parse(readFileSync("artifacts/staging.json", "utf8"));
  const stage = await github<Deployment>(`deployments/${staging.deploymentId}`);
  if (
    stage.environment !== "staging/core" ||
    (await statuses(stage.id))[0]?.state !== "success" ||
    JSON.stringify(stage.payload) !== JSON.stringify(candidate)
  ) {
    throw new Error("Staging evidence mismatch");
  }
  const current = await lastSuccess("production/core");
  if (current) {
    git("merge-base", "--is-ancestor", current.sha, candidate.sha);
  }
  if (
    candidate.configurationRevision !== process.env.CORE_CONFIGURATION_REVISION
  ) {
    throw new Error("Candidate configuration changed");
  }
  const releases = JSON.parse(
    run("gh", [
      "api",
      `repos/${repository}/releases?per_page=100`,
      "--paginate",
      "--slurp",
    ]).text
  ).flat() as Release[];
  const pending = releases.filter(
    (item) => item.draft && /^v\d+\.\d+\.\d+$/.test(item.tag_name)
  );
  if (pending.length > 1) {
    throw new Error("Multiple incomplete product releases; reconcile first");
  }
  const reservations = [];
  for (const record of await deployments("release/product")) {
    if ((await statuses(record.id))[0]?.state !== "success") {
      reservations.push(record);
    }
  }
  if (reservations.length > 1) {
    throw new Error(
      "Multiple incomplete product reservations; reconcile first"
    );
  }
  let reservation = reservations[0];
  const old = reservation
    ? productPlanSchema.parse(reservation.payload)
    : pending[0]
      ? readPlan(pending[0].tag_name)
      : undefined;
  // Re-dispatch of an already completed candidate is a no-op, never another version.
  const completed = releases.find(
    (item) =>
      !item.draft &&
      item.assets.some((asset) => asset.name === "release-plan.json") &&
      (!process.env.PRODUCT_VERSION ||
        item.tag_name === `v${process.env.PRODUCT_VERSION}`) &&
      readPlan(item.tag_name).candidate.runId === candidate.runId
  );
  if (completed && (!old || old.candidate.runId === candidate.runId)) {
    if (reservation) {
      await setStatus(
        reservation.id,
        "success",
        `Published ${completed.tag_name}`
      );
    }
    output("complete", "true");
    output("version", completed.tag_name.slice(1));
    process.exit(0);
  }
  git("fetch", "origin", "--tags");
  const version =
    old?.version ??
    productVersion(
      git("tag", "--list").split("\n"),
      process.env.PRODUCT_VERSION
    );
  if (
    old &&
    process.env.PRODUCT_VERSION &&
    process.env.PRODUCT_VERSION !== old.version
  ) {
    throw new Error("Finish reserved version first");
  }
  const plan = productPlanSchema.parse({
    schemaVersion: 1,
    version,
    candidate,
    stagingDeploymentId: staging.deploymentId,
  });
  if (old) {
    assertSamePlan(old, plan);
  }
  const tag = `v${version}`;
  if (!old && releases.some((item) => item.draft)) {
    throw new Error("Finish existing draft publications before stable release");
  }
  if (!reservation) {
    reservation = await createDeployment(
      "release/product",
      candidate.sha,
      plan
    );
    await setStatus(reservation.id, "in_progress", `Reserved ${tag}`);
  }
  // Reservation survives failure between tag creation, draft creation and plan upload.
  {
    const previous = releases
      .filter((item) => !item.draft && /^v\d+\.\d+\.\d+$/.test(item.tag_name))
      .sort((a, b) =>
        b.tag_name.localeCompare(a.tag_name, undefined, { numeric: true })
      )[0];
    const token = process.env.GH_TOKEN;
    if (!process.env.PRODUCT_TAG_TOKEN) {
      throw new Error("Product tag App token required");
    }
    process.env.GH_TOKEN = process.env.PRODUCT_TAG_TOKEN;
    const tagState = run(
      "gh",
      ["api", `repos/${repository}/git/ref/tags/${tag}`],
      { allowFailure: true }
    );
    if (tagState.ok) {
      const ref = JSON.parse(tagState.text);
      if (ref.object.type !== "commit" || ref.object.sha !== candidate.sha) {
        throw new Error("Product tag points elsewhere");
      }
    } else if (/404|not found/i.test(tagState.stderr)) {
      run("gh", [
        "api",
        `repos/${repository}/git/refs`,
        "--method",
        "POST",
        "-f",
        `ref=refs/tags/${tag}`,
        "-f",
        `sha=${candidate.sha}`,
      ]);
    } else {
      throw new Error("Cannot inspect product tag");
    }
    if (!releases.some((item) => item.tag_name === tag)) {
      run("gh", [
        "release",
        "create",
        tag,
        "--target",
        candidate.sha,
        "--draft",
        "--title",
        `Lunaris ${version}`,
        "--generate-notes",
        ...(previous
          ? ["--notes-start-tag", previous.tag_name]
          : existsSync(".release/product-transition.md")
            ? [
                "--notes",
                readFileSync(".release/product-transition.md", "utf8"),
              ]
            : []),
      ]);
    }
    process.env.GH_TOKEN = token;
    writeFileSync(
      resolve(work, "release-plan.json"),
      `${JSON.stringify(plan, null, 2)}\n`
    );
    upload(tag, resolve(work, "release-plan.json"));
  }
  output("complete", "false");
  output("version", version);
  output("sha", candidate.sha);
  summary(
    `Stable reservation ${tag}; candidate ${candidate.runId}; source ${candidate.sha}`
  );
} else if (mode === "restore" || mode === "upload") {
  const tag = tagFromEnvironment();
  const plan = readPlan(tag);
  verifySource(plan);
  const group = process.env.PRODUCT_GROUP;
  if (group !== "cli" && group !== "desktop" && group !== "self-hosted") {
    throw new Error("Product artifact group required");
  }
  const receiptName = `${group}-receipt.json`;
  const directory = resolve(process.argv[3] ?? "dist");
  mkdirSync(directory, { recursive: true });
  const cached = release(tag).assets.some(
    (asset) => asset.name === receiptName
  );
  if (mode === "restore") {
    if (cached) {
      const receipt = assetReceiptSchema.parse(
        JSON.parse(readFileSync(download(tag, receiptName), "utf8"))
      );
      if (
        receipt.version !== plan.version ||
        receipt.sourceCommit !== plan.candidate.sha ||
        receipt.group !== group
      ) {
        throw new Error("Artifact receipt source mismatch");
      }
      for (const asset of receipt.assets) {
        const available = release(tag).assets.some(
          (item) => item.name === asset.name
        );
        const path = resolve(directory, asset.name);
        if (available) {
          download(tag, asset.name, directory);
        } else {
          // Successful native builds survive runner loss before all GitHub uploads finish.
          const recovery = resolve(work, "recovery", group);
          mkdirSync(recovery, { recursive: true });
          run("gh", [
            "run",
            "download",
            receipt.producerRunId,
            "--name",
            group === "self-hosted"
              ? "release-self-hosted"
              : `release-${group}`,
            "--dir",
            recovery,
          ]);
          writeFileSync(path, readFileSync(resolve(recovery, asset.name)));
        }
        if (hash(path) !== asset.sha256) {
          throw new Error(`Checksum mismatch: ${asset.name}`);
        }
      }
      writeFileSync(
        resolve(directory, "SHA256SUMS"),
        receipt.assets
          .map((asset) => `${asset.sha256}  ${asset.name}\n`)
          .join("")
      );
    }
    output("cached", String(cached));
  } else {
    const assets = readdirSync(directory)
      .filter(
        (name) => /\.(zip|dmg|tar\.gz)$/.test(name) || name === "install.sh"
      )
      .map((name) => ({ name, sha256: hash(resolve(directory, name)) }));
    const proposed = assetReceiptSchema.parse({
      schemaVersion: 1,
      version: plan.version,
      sourceCommit: plan.candidate.sha,
      group,
      producerRunId: process.env.GITHUB_RUN_ID,
      assets,
    });
    const receipt = cached
      ? assetReceiptSchema.parse(
          JSON.parse(readFileSync(download(tag, receiptName), "utf8"))
        )
      : proposed;
    if (
      receipt.version !== proposed.version ||
      receipt.sourceCommit !== proposed.sourceCommit ||
      receipt.group !== group ||
      JSON.stringify(receipt.assets) !== JSON.stringify(proposed.assets)
    ) {
      throw new Error("Existing artifact receipt differs");
    }
    const path = resolve(work, receiptName);
    writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
    upload(tag, path);
    for (const asset of receipt.assets) {
      upload(tag, resolve(directory, asset.name));
    }
  }
} else if (mode === "finalize") {
  const tag = tagFromEnvironment();
  const plan = readPlan(tag);
  verifySource(plan);
  const deployed = await lastSuccess("production/core");
  if (
    !deployed ||
    JSON.stringify(deployed.payload) !== JSON.stringify(plan.candidate)
  ) {
    throw new Error("Product candidate not deployed successfully");
  }
  const assets = [];
  for (const group of ["cli", "desktop", "self-hosted"]) {
    const receipt = assetReceiptSchema.parse(
      JSON.parse(readFileSync(download(tag, `${group}-receipt.json`), "utf8"))
    );
    if (
      receipt.version !== plan.version ||
      receipt.sourceCommit !== plan.candidate.sha ||
      receipt.group !== group
    ) {
      throw new Error("Mismatched release receipt");
    }
    for (const asset of receipt.assets) {
      if (hash(download(tag, asset.name)) !== asset.sha256) {
        throw new Error(`Checksum mismatch: ${asset.name}`);
      }
      assets.push(asset);
    }
  }
  const manifest = { ...plan, assets, productionDeploymentId: deployed.id };
  for (const [name, content] of [
    ["release-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
    [
      "SHA256SUMS",
      assets.map((asset) => `${asset.sha256}  ${asset.name}\n`).join(""),
    ],
  ]) {
    const path = resolve(work, name!);
    writeFileSync(path, content!);
    upload(tag, path);
  }
  run("gh", ["release", "edit", tag, "--draft=false", "--latest"]);
  for (const record of await deployments("release/product")) {
    if (
      JSON.stringify(productPlanSchema.parse(record.payload)) ===
      JSON.stringify(plan)
    ) {
      await setStatus(record.id, "success", `Published ${tag}`);
    }
  }
  summary(
    `Released ${tag}; source ${plan.candidate.sha}; production record ${deployed.id}`
  );
} else {
  throw new Error("Expected reserve, restore, upload or finalize");
}
