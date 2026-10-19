"use strict";
const { appendFileSync, readFileSync } = require("node:fs");

const { packageManager } = JSON.parse(readFileSync("package.json", "utf8"));
const match =
  typeof packageManager === "string" &&
  /^bun@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(packageManager);
if (!match) {
  throw new Error("packageManager must pin an exact Bun version: bun@x.y.z");
}
const version = match[1];
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
// Retain the version in job-level Turbo cache keys.
appendFileSync(process.env.GITHUB_ENV, `BUN_VERSION=${version}\n`);
