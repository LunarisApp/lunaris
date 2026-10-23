import { mkdirSync, writeFileSync } from "node:fs";
import { waitForReady } from "../ci/readiness";
import { run } from "../release/automation/process";
import { z } from "zod";

const image = z.string().regex(/^ghcr\.io\/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$/);
const images = z
  .object({ api: image, web: image })
  .strict()
  .parse(JSON.parse(process.env.CANDIDATE_IMAGES ?? "null"));
const login = Bun.spawn(
  [
    "docker",
    "login",
    "ghcr.io",
    "-u",
    process.env.REGISTRY_USER ?? "",
    "--password-stdin",
  ],
  {
    stdin: new Blob([process.env.REGISTRY_TOKEN ?? ""]),
    stdout: "inherit",
    stderr: "inherit",
  }
);
if (await login.exited) {
  throw new Error("Registry login failed");
}
for (const reference of Object.values(images)) {
  run("docker", ["pull", reference], { inheritOutput: true });
}
run(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    "host",
    "--env-file",
    "apps/api/.env.e2e",
    images.api,
    "bun",
    "migrate.ts",
  ],
  { inheritOutput: true }
);
mkdirSync("logs", { recursive: true });
run(
  "docker",
  [
    "run",
    "-d",
    "--name",
    "lunaris-e2e-api",
    "--network",
    "host",
    "--env-file",
    "apps/api/.env.e2e",
    images.api,
  ],
  { inheritOutput: true }
);
const logFile = Bun.file("logs/backend.log");
const logs = Bun.spawn(["docker", "logs", "-f", "lunaris-e2e-api"], {
  stdout: logFile,
  stderr: logFile,
});
writeFileSync("logs/backend.pid", String(logs.pid));
await waitForReady("http://127.0.0.1:3000/v1/health", {
  alive: () => logs.exitCode === null,
});
for (const port of [5173, 4173]) {
  const name = `lunaris-e2e-web-${port}`;
  run(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "host",
      "-e",
      `PORT=${port}`,
      // The isolated stack uses local HTTP/WebSocket origins.
      "-e",
      "NODE_ENV=development",
      "-e",
      "VITE_REGION_DIRECTORY_URL=/regions.json",
      "-e",
      'VITE_REGION_DIRECTORY_JSON=[{"id":"local","label":"Local","apiUrl":"http://localhost:3000","status":"active","default":true}]',
      images.web,
    ],
    { inheritOutput: true }
  );
  await waitForReady(`http://127.0.0.1:${port}/health`, {
    alive: () =>
      run("docker", ["inspect", "-f", "{{.State.Running}}", name], {
        allowFailure: true,
      }).text === "true",
  });
}

logs.unref();
