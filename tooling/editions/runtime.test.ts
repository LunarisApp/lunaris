import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readEdition } from "./edition";
import { assembleRuntime } from "./runtime";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture(edition: "community" | "enterprise") {
  const root = mkdtempSync(join(tmpdir(), "lunaris-edition-"));
  directories.push(root);
  const put = (path: string, value: unknown) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value)
    );
  };
  put("package.json", { overrides: {} });
  put("apps/api/package.json", {
    name: "api",
    dependencies: {
      "@repo/auth": "workspace:*",
      "@repo/ee-audit": "workspace:*",
      "@repo/ee-teams": "workspace:*",
    },
    devDependencies: { test: "1.0.0" },
    scripts: { prepare: "exit 1" },
  });
  put("internal/auth/package.json", { name: "@repo/auth" });
  put("internal/auth/src/schema.ts", "core compatibility schema");
  put("internal/auth/src/auth.test.ts", "test only");
  put("internal/auth/.env.local", "SECRET=private");
  put("ee/audit/package.json", { name: "@repo/ee-audit" });
  put("ee/audit/src/server/audit.service.ts", "enterprise implementation");
  put("ee/teams/package.json", { name: "@repo/ee-teams" });
  put("ee/teams/src/server/teams.ts", "enterprise teams");
  put("ee/LICENSE", "Enterprise license");
  put("apps/landing/package.json", { name: "landing" });
  put("apps/landing/src/index.ts", "restricted template");
  put("apps/api/dist/edition.json", { edition });
  put("apps/web/dist/edition.json", { edition });
  put("apps/api/drizzle/0001.sql", "existing migration");
  for (const name of ["LICENSE", "THIRD-PARTY-NOTICES.md", "bun.lock"]) {
    put(name, name);
  }
  return { root, put, destination: join(root, "runtime") };
}
test("community runtime excludes EE and unrelated source but preserves schema and migrations", () => {
  const f = fixture("community");
  assembleRuntime(f.root, f.destination, "community");
  expect(existsSync(join(f.destination, "ee"))).toBe(false);
  expect(existsSync(join(f.destination, "apps/landing"))).toBe(false);
  expect(existsSync(join(f.destination, "internal/auth/.env.local"))).toBe(
    false
  );
  expect(
    existsSync(join(f.destination, "internal/auth/src/auth.test.ts"))
  ).toBe(false);
  expect(
    readFileSync(join(f.destination, "apps/api/drizzle/0001.sql"), "utf8")
  ).toBe("existing migration");
  expect(existsSync(join(f.destination, "internal/auth/src/schema.ts"))).toBe(
    true
  );
  const manifest = JSON.parse(
    readFileSync(join(f.destination, "apps/api/package.json"), "utf8")
  );
  expect(manifest.dependencies["@repo/ee-audit"]).toBeUndefined();
  expect(manifest.dependencies["@repo/ee-teams"]).toBeUndefined();
  expect(manifest.devDependencies).toBeUndefined();
  expect(manifest.scripts).toBeUndefined();
});
test("enterprise runtime carries implementation and license", () => {
  const f = fixture("enterprise");
  assembleRuntime(f.root, f.destination, "enterprise");
  expect(
    existsSync(join(f.destination, "ee/audit/src/server/audit.service.ts"))
  ).toBe(true);
  expect(existsSync(join(f.destination, "ee/teams/src/server/teams.ts"))).toBe(
    true
  );
  expect(readFileSync(join(f.destination, "ee/LICENSE"), "utf8")).toBe(
    "Enterprise license"
  );
});
test("rejects mixed artifacts and transitive enterprise imports in community", () => {
  const f = fixture("community");
  f.put("apps/web/dist/edition.json", { edition: "enterprise" });
  expect(() => assembleRuntime(f.root, f.destination, "community")).toThrow(
    "Edition mismatch"
  );
  f.put("apps/web/dist/edition.json", { edition: "community" });
  f.put("internal/auth/package.json", {
    name: "@repo/auth",
    dependencies: { "@repo/ee-audit": "workspace:*" },
  });
  expect(() => assembleRuntime(f.root, f.destination, "community")).toThrow(
    "Enterprise dependency"
  );
});
test("edition selection defaults safely and rejects typos", () => {
  expect(readEdition("community")).toBe("community");
  expect(readEdition("enterprise")).toBe("enterprise");
  expect(() => readEdition("true")).toThrow("Invalid LUNARIS_EDITION");
  expect(() => readEdition("")).toThrow("Invalid LUNARIS_EDITION");
});

test("API-only runtime does not require or copy web output", () => {
  const f = fixture("community");
  rmSync(join(f.root, "apps/web"), { recursive: true });
  assembleRuntime(f.root, f.destination, "community", false);
  expect(existsSync(join(f.destination, "apps/api/drizzle"))).toBe(true);
  expect(existsSync(join(f.destination, "apps/web"))).toBe(false);
});
