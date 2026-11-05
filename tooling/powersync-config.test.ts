import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const script = path.join(import.meta.dir, "powersync-config.ts");
const rendered = Bun.spawnSync([process.execPath, script]);
if (rendered.exitCode !== 0) {
  throw new Error(rendered.stderr.toString());
}
const shared = rendered.stdout.toString();
const api = `api:\n  tokens:\n    - !env PS_ADMIN_TOKEN\n${shared}`;

test.each([
  { unified: false, mode: "--check-production", valid: true },
  { unified: true, mode: "--check-production", valid: true },
  { unified: true, mode: "--deploy-production", valid: true },
  { unified: true, mode: "--check-production", valid: false },
])("PowerSync config $mode unified=$unified valid=$valid", (scenario) => {
  const directory = mkdtempSync(path.join(tmpdir(), "powersync-config-"));
  try {
    const configs = {
      api: Buffer.from(scenario.valid ? api : shared).toString("base64"),
      compact: Buffer.from(shared).toString("base64"),
      replication: Buffer.from(shared).toString("base64"),
    };
    // Unexpected writes fail, so an already matching unified service must be a no-op.
    writeFileSync(
      path.join(directory, "railway"),
      `#!${process.execPath}\nconst args = process.argv.slice(2);
if (args[0] === "variable") {
  const configs = JSON.parse(process.env.TEST_CONFIGS);
  console.log(JSON.stringify({POWERSYNC_CONFIG_B64: configs[args[args.indexOf("--service") + 1]]}));
} else if (args[0] === "deployment") {
  console.log(JSON.stringify([{id: "healthy", status: "SUCCESS"}]));
} else {
  process.exit(1);
}
`,
      { mode: 0o755 }
    );
    const result = Bun.spawnSync([process.execPath, script, scenario.mode], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        TEST_CONFIGS: JSON.stringify(configs),
        POWERSYNC_API_SERVICE_ID: "api",
        POWERSYNC_REPLICATION_SERVICE_ID: scenario.unified
          ? "api"
          : "replication",
        POWERSYNC_COMPACT_SERVICE_ID: "compact",
        POWERSYNC_PROJECT_ID: "project",
        POWERSYNC_ENVIRONMENT_ID: "environment",
      },
    });
    expect(result.exitCode).toBe(scenario.valid ? 0 : 1);
    if (scenario.valid) {
      expect(result.stdout.toString()).toContain("matches local config");
    } else {
      expect(result.stderr.toString()).toContain("PowerSync config differs");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
