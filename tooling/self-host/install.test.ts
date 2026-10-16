import { spawnSync } from "bun";
import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture(volumes = false) {
  const root = mkdtempSync(join(tmpdir(), "lunaris-installer-"));
  roots.push(root);
  copyFileSync("infra/self-host/install.sh", join(root, "install.sh"));
  const docker = join(root, "docker");
  const calls = join(root, "docker-calls");
  writeFileSync(
    docker,
    `#!/bin/sh
printf '%s\\n' "$*" >> '${calls}'
case "$*" in
  info) exit 0 ;;
  'compose version --short') echo 2.35.0 ;;
  'volume ls '*) ${volumes ? "echo existing-postgres-volume" : ":"} ;;
  *) echo unexpected-docker-command >&2; exit 1 ;;
esac
`
  );
  chmodSync(docker, 0o755);
  const env = {
    ...process.env,
    PATH: `${root}:${process.env.PATH}`,
    PUBLIC_URL: undefined,
    COMPOSE_PROJECT_NAME: "fixture-installer",
  };
  const invoke = (
    url?: string,
    environment: Record<string, string | undefined> = {}
  ) =>
    spawnSync(["bash", join(root, "install.sh"), ...(url ? [url] : [])], {
      cwd: root,
      detached: true,
      timeout: 3000,
      env: { ...env, ...environment },
    });
  return { root, calls, invoke, env };
}
test("first install without a terminal requires a URL argument", () => {
  const { root, invoke } = fixture();
  const result = invoke();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain(
    "No terminal available. Pass a public URL"
  );
  expect(existsSync(join(root, ".env"))).toBe(false);
});

test("first install reads domain or URL from terminal with stdin redirected", async () => {
  for (const input of [
    "notes.example.com",
    "https://notes.example.com",
    "http://localhost:8080",
    "bad/path",
    "",
  ]) {
    const { root, env } = fixture();
    let output = "";
    let answered = false;
    const child = Bun.spawn(
      ["bash", "-c", 'bash "$1" </dev/null', "_", join(root, "install.sh")],
      {
        cwd: root,
        env,
        timeout: 3000,
        terminal: {
          data(terminal, data) {
            output += Buffer.from(data).toString();
            if (!answered && output.includes("Domain or public URL")) {
              answered = true;
              terminal.write(`${input}\n`);
            }
          },
        },
      }
    );
    try {
      await child.exited;
      expect(answered, output).toBe(true);
      const path = join(root, ".env");
      if (input === "bad/path" || input === "") {
        expect(existsSync(path)).toBe(false);
      } else {
        const origin = input.includes("://") ? input : `https://${input}`;
        expect(readFileSync(path, "utf8")).toContain(`PUBLIC_URL=${origin}\n`);
      }
      expect(existsSync(join(root, ".install.lock"))).toBe(false);
    } finally {
      child.kill();
      child.terminal?.close();
    }
  }
}, 10_000);

test("missing .env with existing volumes refuses secret generation", () => {
  const { root, invoke } = fixture(true);
  const result = invoke("https://notes.example.com");
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("Restore configuration/secrets");
  expect(existsSync(join(root, ".env"))).toBe(false);
  expect(existsSync(join(root, ".install.lock"))).toBe(false);
});
test("invalid origins cannot create configuration or reach deployment", () => {
  for (const url of [
    "http://example.com",
    "https://notes.example.com/path",
    "https://notes.example.com/",
    "https://notes.example.com\nINJECT=bad",
    "http://localhost:70000",
  ]) {
    const { root, invoke } = fixture();
    expect(invoke(url).exitCode).not.toBe(0);
    expect(existsSync(join(root, ".env"))).toBe(false);
  }
});
test("configuration survives failed preflight and retry byte-for-byte", () => {
  const { root, invoke } = fixture();
  expect(invoke("https://notes.example.com").exitCode).not.toBe(0);
  const before = readFileSync(join(root, ".env"), "utf8");
  expect(before).toMatch(/^DATABASE_PASSWORD=[a-f0-9]{64}$/m);
  expect(invoke().exitCode).not.toBe(0);
  expect(readFileSync(join(root, ".env"), "utf8")).toBe(before);
});

test("ambient AWS credentials cannot override stored Garage credentials", () => {
  const { invoke } = fixture();
  invoke("https://notes.example.com");
  const result = invoke(undefined, { AWS_ACCESS_KEY_ID: "ambient-cloud-key" });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain(
    "AWS_ACCESS_KEY_ID environment conflicts"
  );
});

test("project name is saved and reused without an exported shell variable", () => {
  const { root, calls, invoke } = fixture();
  invoke("https://notes.example.com");
  expect(readFileSync(join(root, ".env"), "utf8")).toContain(
    "COMPOSE_PROJECT_NAME=fixture-installer\n"
  );
  writeFileSync(calls, "");
  invoke(undefined, { COMPOSE_PROJECT_NAME: undefined });
  expect(readFileSync(calls, "utf8")).toContain(
    "compose --project-name fixture-installer config --quiet"
  );
});

test("installer honors existing .env project name", () => {
  const { root, calls, invoke } = fixture();
  invoke("https://notes.example.com");
  const path = join(root, ".env");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace(
      "COMPOSE_PROJECT_NAME=fixture-installer",
      "COMPOSE_PROJECT_NAME=saved-installation"
    )
  );
  writeFileSync(calls, "");
  invoke(undefined, { COMPOSE_PROJECT_NAME: undefined });
  expect(readFileSync(calls, "utf8")).toContain(
    "compose --project-name saved-installation config --quiet"
  );
});
