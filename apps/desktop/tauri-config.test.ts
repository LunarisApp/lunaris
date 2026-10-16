import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")
) as {
  app: {
    security: {
      dangerousDisableAssetCspModification?: boolean | string[];
      csp: {
        "connect-src": string;
        "font-src": string;
        "frame-src": string;
        "script-src": string;
        "style-src": string;
      };
    };
  };
  build: { beforeBuildCommand: string };
};
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8")
) as { scripts: { "build:dependencies": string } };

describe("desktop build", () => {
  it("builds workspace dependencies before the desktop frontend", () => {
    expect(packageJson.scripts["build:dependencies"]).toBe(
      "turbo run build --filter=desktop^..."
    );
    expect(config.build.beforeBuildCommand).toBe(
      "bun run build:dependencies && bun run build:agent && bun run build && bun run build:notices"
    );
  });
});

describe("desktop CSP", () => {
  it("preserves inline styles in extension frames without disabling script protection", () => {
    // Tauri nonces the initial loader's <style>. Blob frames inherit that CSP,
    // where a nonce makes 'unsafe-inline' ineffective for their runtime CSS.
    expect(config.app.security.dangerousDisableAssetCspModification).toEqual([
      "style-src",
    ]);
    expect(config.app.security.csp["style-src"].split(" ")).toContain(
      "'unsafe-inline'"
    );
    expect(config.app.security.csp["script-src"].split(" ")).not.toContain(
      "'unsafe-inline'"
    );
  });

  it("allows HTTPS for external extension networking", () => {
    const connectSource = config.app.security.csp["connect-src"];
    expect(connectSource.split(" ")).toContain("https:");
  });

  it("allows local blob iframe sandboxes", () => {
    expect(config.app.security.csp["font-src"].split(" ")).toContain("blob:");
    expect(config.app.security.csp["frame-src"].split(" ")).toContain("blob:");
    expect(config.app.security.csp["script-src"]).toContain(
      "'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg='"
    );
  });
});
