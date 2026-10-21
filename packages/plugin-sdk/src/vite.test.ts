import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "vite";
import { defineLunarisPluginConfig } from "./vite";

const roots: string[] = [];
const validSource = `
import manifest from "../manifest.json";
export default { manifest, activate() {} };
`;
const rasterIcons = [
  {
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    extension: "png",
  },
  {
    data: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v0gUAA=",
    extension: "webp",
  },
  {
    data: "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJXAIf/Z",
    extension: "jpg",
  },
] as const;

async function fixture(source: string) {
  const root = await mkdtemp(path.join(tmpdir(), "lunaris-plugin-"));
  roots.push(root);
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      description: "Test plugin",
      developer: "Lunaris",
      id: "test.plugin",
      name: "Test",
      api: "^0.9.0",
      permissions: [],
      version: "1.2.3",
    })
  );
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.tsx"), source);
  return root;
}

async function buildFixture(root: string, options = {}) {
  await build(await defineLunarisPluginConfig({ root, ...options }));
}

async function installedPackageRoot(
  name: string,
  resolveFrom?: string
): Promise<string> {
  const resolver = resolveFrom
    ? createRequire(createRequire(import.meta.url).resolve(resolveFrom))
    : createRequire(import.meta.url);
  let current = path.dirname(resolver.resolve(name));
  while (true) {
    try {
      const packageJson = JSON.parse(
        await readFile(path.join(current, "package.json"), "utf8")
      ) as { name?: string };
      if (packageJson.name === name) {
        return current;
      }
    } catch {
      // Continue toward the package root.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not resolve package root: ${name}`);
    }
    current = parent;
  }
}

async function copyRuntimePackages(root: string) {
  const packages = [
    ["lib0", "yjs"],
    ["react"],
    ["react-dom"],
    ["scheduler", "react-dom"],
    ["yjs"],
  ] as const;
  for (const [name, resolveFrom] of packages) {
    await cp(
      await installedPackageRoot(name, resolveFrom),
      path.join(root, "node_modules", name),
      { recursive: true }
    );
  }
}

async function linkedRuntimeFixture() {
  const root = await fixture(`
import { useState as react } from "react";
import { createPortal as reactDom } from "react-dom";
import { Doc as yjs } from "yjs";
import { identities } from "linked-runtime-consumer";
if (react !== identities.react || reactDom !== identities.reactDom || yjs !== identities.yjs) {
  throw new Error("Singleton runtime mismatch");
}
${validSource}
`);
  const linkedRoot = path.join(root, "linked-runtime-consumer");
  await copyRuntimePackages(root);
  await copyRuntimePackages(linkedRoot);
  await writeFile(
    path.join(linkedRoot, "package.json"),
    JSON.stringify({
      exports: "./index.js",
      name: "linked-runtime-consumer",
      type: "module",
    })
  );
  await writeFile(
    path.join(linkedRoot, "index.js"),
    `
import { useState as react } from "react";
import { createPortal as reactDom } from "react-dom";
import { Doc as yjs } from "yjs";
export const identities = { react, reactDom, yjs };
`
  );
  await symlink(
    linkedRoot,
    path.join(root, "node_modules", "linked-runtime-consumer"),
    process.platform === "win32" ? "junction" : "dir"
  );
  return root;
}

beforeEach(() => {
  vi.stubEnv("GITHUB_REF_NAME", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

// Real builds and runtime package copies need headroom on shared CI runners.
describe("Lunaris Vite plugin compiler", { timeout: 30_000 }, () => {
  it("emits one registering IIFE and normalized manifest", async () => {
    const root = await fixture(validSource);
    await buildFixture(root, { tag: "1.2.3" });
    const output = await readFile(path.join(root, "dist/main.js"), "utf8");
    expect(output).toContain("__LUNARIS_PLUGIN_SANDBOX_V6__");
    expect(output).not.toContain("__LUNARIS_PLUGIN_RUNTIME_V1__");
    expect(
      JSON.parse(await readFile(path.join(root, "dist/manifest.json"), "utf8"))
    ).toMatchObject({ id: "test.plugin", version: "1.2.3" });
  });

  it.each(rasterIcons)(
    "emits CSS and a validated .$extension icon",
    async ({ data, extension }) => {
      const root = await fixture(`import "./styles.css"; ${validSource}`);
      await writeFile(
        path.join(root, "src/styles.css"),
        ".test { color: red; }"
      );
      await writeFile(
        path.join(root, `icon.${extension}`),
        Buffer.from(data, "base64")
      );
      await buildFixture(root);
      await expect(
        readFile(path.join(root, "dist/styles.css"))
      ).resolves.toBeTruthy();
      await expect(
        readFile(path.join(root, `dist/icon.${extension}`))
      ).resolves.toBeTruthy();
    }
  );

  it("rejects tag and registry ID mismatches before building", async () => {
    const root = await fixture(validSource);
    await expect(
      defineLunarisPluginConfig({ root, tag: "1.2.4" })
    ).rejects.toThrow("must match extension version");
    await expect(
      defineLunarisPluginConfig({ expectedId: "other.plugin", root })
    ).rejects.toThrow("must match registry ID");
  });

  it("accepts activation-time registrations absent from manifests", async () => {
    const root = await fixture(validSource);
    await expect(buildFixture(root)).resolves.toBeUndefined();
  });

  it("deduplicates singleton runtimes across linked packages", async () => {
    const root = await linkedRuntimeFixture();
    const config = await defineLunarisPluginConfig({ root });

    expect(config.resolve?.dedupe).toEqual(["react", "react-dom", "yjs"]);
    await expect(build(config)).resolves.toBeDefined();
  });

  it("rejects duplicate singleton runtime package roots", async () => {
    const root = await linkedRuntimeFixture();
    const config = await defineLunarisPluginConfig({ root });
    config.resolve = { ...config.resolve, dedupe: [] };

    try {
      await build(config);
      throw new Error("Expected duplicate singleton validation to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('duplicate singleton dependency "react"');
      expect(message).toContain(path.join(root, "node_modules", "react"));
      expect(message).toContain(
        path.join(root, "linked-runtime-consumer", "node_modules", "react")
      );
    }
  });

  it("does not expose network access while validating runtime code", async () => {
    const root = await fixture(
      `void fetch("https://example.com"); ${validSource}`
    );
    await expect(buildFixture(root)).rejects.toThrow("fetch is not defined");
  });

  it("provides browser globals while validating runtime code", async () => {
    const root = await fixture(`
void devicePixelRatio;
void document.createElement("canvas").getContext("2d");
void Element;
void new DOMException();
void navigator.userAgent;
void window.location.origin;
${validSource}
`);
    await expect(buildFixture(root)).resolves.toBeUndefined();
  });

  it("times out stalled runtime registration", async () => {
    const root = await fixture(`
import manifest from "../manifest.json";
export default { manifest, activate() { return new Promise(() => {}); } };
`);

    await expect(buildFixture(root)).rejects.toThrow(
      "runtime registration timed out"
    );
  });

  it.each([
    'import "node:fs";',
    'import "node:fs/promises";',
    `import "@${"repo"}/private";`,
    'import "@extension/other";',
    'import "@tauri-apps/api";',
    'import "@lunarisapp/plugin-sdk/vite";',
    'import "@lunarisapp/plugin-sdk/internal";',
    'import "@lunarisapp/plugin-sdk/sandbox";',
    'import WorkerUrl from "./worker.ts?worker"; void WorkerUrl;',
    'import WorkerUrl from "./worker.ts?sharedworker&inline"; void WorkerUrl;',
    'import moduleUrl from "./module.wasm"; void moduleUrl;',
  ])("rejects a forbidden import: %s", async (source) => {
    const root = await fixture(`${source} ${validSource}`);
    await expect(buildFixture(root)).rejects.toThrow(
      "Forbidden extension import"
    );
  });

  it("rejects worker runtime output", async () => {
    const root = await fixture(
      `void new Worker("https://example.com/worker.js"); ${validSource}`
    );
    await expect(buildFixture(root)).rejects.toThrow("worker or WebAssembly");
  });

  it("inlines dedicated worker imports into the single extension script", async () => {
    const root = await fixture(
      `import TaskWorker from "./task.worker?worker&inline"; void TaskWorker; ${validSource}`
    );
    await writeFile(
      path.join(root, "src/task.worker.ts"),
      'self.addEventListener("message", ({ data }) => self.postMessage(data));'
    );

    await buildFixture(root);

    expect((await readdir(path.join(root, "dist"))).sort()).toEqual([
      "main.js",
      "manifest.json",
      "runtime.json",
    ]);
    expect(
      JSON.parse(await readFile(path.join(root, "dist/runtime.json"), "utf8"))
    ).toEqual({ kind: "iframe", protocol: 7 });
    expect(await readFile(path.join(root, "dist/main.js"), "utf8")).toContain(
      "createObjectURL"
    );
  });

  it("rejects WebAssembly inside inline worker modules", async () => {
    const root = await fixture(
      `import TaskWorker from "./task.worker?worker&inline"; void TaskWorker; ${validSource}`
    );
    await writeFile(
      path.join(root, "src/task.worker.ts"),
      "void WebAssembly.compile(new Uint8Array());"
    );

    await expect(buildFixture(root)).rejects.toThrow("worker or WebAssembly");
  });

  it.each([
    'void new Worker("https://example.com/worker.js");',
    'void new SharedWorker("https://example.com/worker.js");',
    "void WebAssembly.compile(new Uint8Array());",
  ])(
    "rejects an unsafe runtime in imported extension modules: %s",
    async (unsafe) => {
      const root = await fixture(`import "./unsafe"; ${validSource}`);
      await writeFile(path.join(root, "src/unsafe.ts"), unsafe);

      await expect(buildFixture(root)).rejects.toThrow("worker or WebAssembly");
    }
  );

  it("rejects unresolved dynamic imports", async () => {
    const root = await fixture(
      `const moduleName = "./dynamic"; void import(moduleName); ${validSource}`
    );
    await expect(buildFixture(root)).rejects.toThrow("dynamic import");
  });

  it("rejects relative imports outside the extension root", async () => {
    const root = await fixture(validSource);
    const outside = `${root}-unsafe.ts`;
    roots.push(outside);
    await writeFile(outside, "export const unsafe = true;");
    await writeFile(
      path.join(root, "src/index.tsx"),
      `import ${JSON.stringify(path.relative(path.join(root, "src"), outside))}; ${validSource}`
    );

    await expect(buildFixture(root)).rejects.toThrow("outside root");
  });

  it("rejects invalid and oversized icons", async () => {
    const root = await fixture(validSource);
    await writeFile(
      path.join(root, "icon.png"),
      Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(37)])
    );
    await expect(buildFixture(root)).rejects.toThrow("valid raster image");

    await writeFile(
      path.join(root, "icon.png"),
      Buffer.alloc(256 * 1024 + 1, 1)
    );
    await expect(buildFixture(root)).rejects.toThrow("exceeds");
  });

  it("rejects raster icons with mismatched extensions", async () => {
    const root = await fixture(validSource);
    await writeFile(
      path.join(root, "icon.webp"),
      Buffer.from(rasterIcons[0].data, "base64")
    );

    await expect(buildFixture(root)).rejects.toThrow(
      "matching its file extension"
    );
  });

  it("rejects multiple icon files", async () => {
    const root = await fixture(validSource);
    await Promise.all(
      rasterIcons
        .slice(0, 2)
        .map(({ data, extension }) =>
          writeFile(
            path.join(root, `icon.${extension}`),
            Buffer.from(data, "base64")
          )
        )
    );

    await expect(buildFixture(root)).rejects.toThrow(
      "Extension root must contain at most one icon file"
    );
  });
});
