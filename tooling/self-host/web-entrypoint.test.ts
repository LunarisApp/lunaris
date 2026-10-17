import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function invoke(url: string, mode?: string, args: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "lunaris-web-entrypoint-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const caddy = join(bin, "caddy");
  writeFileSync(
    caddy,
    `#!${process.execPath}
console.log(JSON.stringify({
  site: process.env.CADDY_SITE_ADDRESS,
  scheme: process.env.PUBLIC_SCHEME,
  authority: process.env.PUBLIC_AUTHORITY,
  presence: process.env.PRESENCE_ORIGIN,
  args: process.argv.slice(2),
}));
`
  );
  chmodSync(caddy, 0o755);
  return Bun.spawnSync(
    ["sh", resolve("infra/self-host/web-entrypoint.sh"), ...args],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PUBLIC_URL: url,
        TLS_MODE: mode,
      },
    }
  );
}

test("default automatic TLS and localhost listeners retain their public origins", () => {
  for (const [url, site] of [
    ["https://notes.example.com", "https://notes.example.com"],
    ["http://localhost:8080", "http://localhost"],
  ] as const) {
    const result = invoke(url);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toMatchObject({
      site,
      args: [
        "run",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
      ],
    });
  }
});

test("external TLS serves HTTP while retaining HTTPS headers and presence URLs", () => {
  const result = invoke("https://notes.example.com", "external", ["validate"]);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({
    site: "http://notes.example.com",
    scheme: "https",
    authority: "notes.example.com",
    presence: "wss://notes.example.com",
    args: [
      "validate",
      "--config",
      "/etc/caddy/Caddyfile",
      "--adapter",
      "caddyfile",
    ],
  });
});

test("invalid TLS mode and external HTTP origin fail before Caddy starts", () => {
  for (const [url, mode] of [
    ["https://notes.example.com", "invalid"],
    ["http://localhost:8080", "external"],
  ] as const) {
    const result = invoke(url, mode);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString()).toBe("");
  }
});
