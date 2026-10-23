"use strict";
const { appendFileSync } = require("node:fs");

for (const name of ["ACTIONS_RUNTIME_TOKEN", "ACTIONS_RESULTS_URL"]) {
  const value = process.env[name];
  if (!value || /[\r\n]/.test(value) || !process.env.GITHUB_ENV) {
    throw new Error(`Missing or invalid Actions cache runtime: ${name}`);
  }
  if (name === "ACTIONS_RUNTIME_TOKEN") {
    process.stdout.write(`::add-mask::${value}\n`);
  }
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}
appendFileSync(process.env.GITHUB_ENV, "ACTIONS_CACHE_SERVICE_V2=true\n");
