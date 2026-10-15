import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEdition } from "./edition";

const root = resolve(import.meta.dirname, "../..");
const directory = resolve(root, "apps/api");
const edition = readEdition();
const action = process.argv[2];
if (action !== "build" && action !== "dev" && action !== "start" && action !== "debug") {
  throw new Error("Expected build, dev, debug, or start");
}
const base = JSON.parse(readFileSync(resolve(directory, "tsconfig.json"), "utf8"));
const configName = `.tsconfig.${edition}.${process.pid}.json`;
const development = action === "dev" || action === "debug";
const config = {
  extends: action === "build" ? "./tsconfig.build.json" : "./tsconfig.json",
  compilerOptions: {
    incremental: false,
    paths: {
      ...base.compilerOptions.paths,
      "@app/edition": [edition === "enterprise" ? "./src/enterprise/edition.ts" : "./src/edition/community.ts"],
    },
  },
  ...(action === "build" ? {
    exclude: ["node_modules", "test", "dist", "**/*spec.ts", ...(edition === "community" ? ["src/enterprise"] : [])],
  } : {}),
};
if (action === "build") {
  writeFileSync(resolve(directory, configName), `${JSON.stringify(config, null, 2)}\n`);
}

async function run(command: string[], env = process.env) {
  const child = Bun.spawn(command, { cwd: directory, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const terminate = () => child.kill("SIGTERM");
  const interrupt = () => child.kill("SIGINT");
  process.on("SIGTERM", terminate);
  process.on("SIGINT", interrupt);
  try {
    const code = await child.exited;
    if (code !== 0) throw new Error(`API ${action} exited with code ${code}`);
  } finally {
    process.off("SIGTERM", terminate);
    process.off("SIGINT", interrupt);
  }
}
try {
  if (action === "build") {
    await run(["bun", "../../tooling/clean-dist.ts"]);
    await run(["bun", "x", "--no-install", "tsc", "-p", configName]);
    await run(["bun", "x", "--no-install", "tsc-alias", "-p", configName]);
    if (edition === "community") {
      if (existsSync(resolve(directory, "dist/src/enterprise"))) {
        throw new Error("Enterprise adapters in community API build");
      }
      for (const file of new Bun.Glob("**/*.js").scanSync(resolve(directory, "dist"))) {
        if (/@repo\/ee-|["'](?:[^"']*\/)ee\//.test(readFileSync(resolve(directory, "dist", file), "utf8"))) {
          throw new Error(`Enterprise import in community API build: ${file}`);
        }
      }
    }
    writeFileSync(resolve(directory, "dist/edition.json"), `${JSON.stringify({ edition })}\n`);
  } else {
    await run(["bun", "--preload", "../../tooling/editions/api-preload.ts", ...(development ? ["--watch"] : []), ...(action === "debug" ? ["--inspect"] : []), "src/main.ts"], {
      ...process.env,
      LUNARIS_EDITION: edition,
      ...(development ? { NODE_ENV: "development" } : {}),
    });
  }
} finally {
  rmSync(resolve(directory, configName), { force: true });
}
