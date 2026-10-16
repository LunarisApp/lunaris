import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const apiDirectory = resolve(import.meta.dirname, "../../apps/api");
const preload = resolve(import.meta.dirname, "api-preload.ts");

for (const edition of ["community", "enterprise"] as const) {
  test(`${edition} runtime preserves Nest decorators, metadata, and edition selection`, async () => {
    const directory = mkdtempSync(join(apiDirectory, ".edition-test-"));
    const entrypoint = join(directory, "main.ts");
    writeFileSync(
      entrypoint,
      `
      import "reflect-metadata";
      import { Controller, Get } from "@nestjs/common";
      import { organizationTeams } from "@app/edition";
      class Dependency {}
      @Controller("probe")
      class Probe {
        constructor(readonly dependency: Dependency) {}
        @Get("ready") ready() {}
      }
      if (Reflect.getMetadata("design:paramtypes", Probe)?.[0] !== Dependency) {
        throw new Error("Constructor metadata missing");
      }
      if (Reflect.getMetadata("path", Probe.prototype.ready) !== "ready") {
        throw new Error("Method decorator metadata missing");
      }
      if (organizationTeams.enabled !== ${edition === "enterprise"}) {
        throw new Error("Wrong edition loaded");
      }
      console.log("runtime verified");
    `
    );
    try {
      const child = Bun.spawn(
        [process.execPath, "--preload", preload, entrypoint],
        {
          cwd: apiDirectory,
          env: { ...process.env, LUNARIS_EDITION: edition },
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("runtime verified");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
