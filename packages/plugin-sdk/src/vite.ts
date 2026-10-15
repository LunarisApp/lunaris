import { isBuiltin } from "node:module";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { fileTypeFromBuffer } from "file-type";
import type { Plugin, UserConfig } from "vite";
import { validateManifest, validateSupportedManifest } from "./manifest";

type OutputBundle = Record<
  string,
  | { code: string; isEntry: boolean; type: "chunk" }
  | { source: string | Uint8Array; type: "asset" }
>;

const MAX_PLUGIN_SCRIPT_BYTES = 10 * 1024 * 1024;
const MAX_PLUGIN_STYLE_BYTES = 2 * 1024 * 1024;
const MAX_PLUGIN_ICON_BYTES = 256 * 1024;
const RUNTIME_VALIDATION_TIMEOUT_MS = 1_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const VIRTUAL_ENTRY = "virtual:lunaris-plugin-entry";
const RESOLVED_VIRTUAL_ENTRY = "\0lunaris-plugin-entry";
const FORBIDDEN_PREFIXES = [`@${"repo"}/`, "@extension/", "@tauri-apps/"];
const SINGLETON_RUNTIME_DEPENDENCIES = ["react", "react-dom", "yjs"] as const;
export interface LunarisPluginBuildOptions {
  entry?: string;
  expectedId?: string;
  outDir?: string;
  root?: string;
  tag?: string;
}

function boundaryPlugin(
  entry: string,
  manifestPath: string,
  pluginId: string,
  root: string,
): Plugin {
  function validateExtensionSource(code: string): void {
    if (/\bimport\s*\(/.test(code)) {
      throw new Error("Extension source contains a dynamic import");
    }
    if (/\b(?:Shared)?Worker\s*\(|\bWebAssembly\b/.test(code)) {
      throw new Error(
        "Extension source contains a worker or WebAssembly runtime",
      );
    }
  }
  function extensionSourceFilename(id: string): string | undefined {
    const filename = id.split("?", 1)[0];
    if (!filename || !/\.[cm]?[jt]sx?$/.test(filename)) return undefined;
    const relativePath = path.relative(root, filename);
    if (
      path.isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      relativePath.split(path.sep).includes("node_modules")
    ) {
      return undefined;
    }
    return filename;
  }
  return {
    enforce: "pre",
    name: "lunaris-plugin-boundary",
    resolveId(source, importer) {
      if (source === VIRTUAL_ENTRY) return RESOLVED_VIRTUAL_ENTRY;
      const sourcePath = source.split("?", 1)[0] ?? source;
      const importerPath = importer?.split("?", 1)[0];
      if (
        sourcePath.startsWith(".") &&
        importerPath &&
        extensionSourceFilename(importerPath)
      ) {
        const relativePath = path.relative(
          root,
          path.resolve(path.dirname(importerPath), sourcePath),
        );
        if (
          path.isAbsolute(relativePath) ||
          relativePath === ".." ||
          relativePath.startsWith(`..${path.sep}`)
        ) {
          throw new Error(`Forbidden extension import outside root: ${source}`);
        }
      }
      const query = source.includes("?")
        ? source.slice(source.indexOf("?") + 1)
        : "";
      const queryParams = new URLSearchParams(query);
      const workerImport = queryParams.has("worker");
      const sharedWorkerImport = queryParams.has("sharedworker");
      const inlineWorkerImport =
        workerImport &&
        queryParams.has("inline") &&
        [...queryParams.keys()].every(
          (key) => key === "inline" || key === "worker",
        );
      if (
        isBuiltin(source) ||
        FORBIDDEN_PREFIXES.some((prefix) => source.startsWith(prefix)) ||
        source === "@lunarisapp/plugin-sdk/vite" ||
        source === "@lunarisapp/plugin-sdk/internal" ||
        (source === "@lunarisapp/plugin-sdk/sandbox" &&
          importer !== RESOLVED_VIRTUAL_ENTRY) ||
        sharedWorkerImport ||
        (workerImport && !inlineWorkerImport) ||
        source.split("?", 1)[0]?.endsWith(".wasm")
      ) {
        throw new Error(`Forbidden extension import: ${source}`);
      }
      return null;
    },
    transform(code, id) {
      const query = new URLSearchParams(id.split("?", 2)[1] ?? "");
      if (query.has("inline") && query.has("worker")) return null;
      if (!extensionSourceFilename(id)) return null;
      validateExtensionSource(code);
      return null;
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_ENTRY) {
        return [
          `import { assertPluginDefinitionMatchesManifest, installExternalPluginSandboxRuntime } from "@lunarisapp/plugin-sdk/sandbox";`,
          `import definition from ${JSON.stringify(entry)};`,
          `import manifest from ${JSON.stringify(manifestPath)};`,
          `assertPluginDefinitionMatchesManifest(definition, manifest);`,
          `globalThis.__LUNARIS_PLUGIN_BUILD_REGISTRATION__ = installExternalPluginSandboxRuntime().register(${JSON.stringify(pluginId)}, definition);`,
        ].join("\n");
      }
      const query = new URLSearchParams(id.split("?", 2)[1] ?? "");
      const filename = extensionSourceFilename(id);
      if (filename && query.has("inline") && query.has("worker")) {
        validateExtensionSource(await readFile(filename, "utf8"));
      }
      return null;
    },
  };
}

function byteLength(source: string | Uint8Array): number {
  return typeof source === "string"
    ? Buffer.byteLength(source)
    : source.byteLength;
}

function singletonPackageRoot(
  moduleId: string,
  dependency: (typeof SINGLETON_RUNTIME_DEPENDENCIES)[number],
): string | undefined {
  const normalizedId = moduleId.replaceAll("\\", "/");
  const marker = `/node_modules/${dependency}/`;
  const markerIndex = normalizedId.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  return normalizedId.slice(0, markerIndex + marker.length - 1);
}

function singletonRuntimeValidationPlugin(): Plugin {
  return {
    generateBundle() {
      const packageRoots = new Map(
        SINGLETON_RUNTIME_DEPENDENCIES.map((dependency) => [
          dependency,
          new Set<string>(),
        ]),
      );
      for (const moduleId of this.getModuleIds()) {
        for (const dependency of SINGLETON_RUNTIME_DEPENDENCIES) {
          const packageRoot = singletonPackageRoot(moduleId, dependency);
          if (packageRoot) packageRoots.get(dependency)?.add(packageRoot);
        }
      }
      for (const [dependency, roots] of packageRoots) {
        if (roots.size <= 1) continue;
        throw new Error(
          `Extension build contains duplicate singleton dependency "${dependency}":\n${[
            ...roots,
          ]
            .sort()
            .map((root) => `- ${root}`)
            .join("\n")}`,
        );
      }
    },
    name: "lunaris-plugin-singleton-runtime-validation",
  };
}

function assertMaximum(filename: string, bytes: number, maximum: number): void {
  if (bytes > maximum) throw new Error(`${filename} exceeds ${maximum} bytes`);
}

function isPngRaster(icon: Buffer): boolean {
  if (icon.byteLength < 45 || !icon.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }

  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  while (offset + 12 <= icon.byteLength) {
    const length = icon.readUInt32BE(offset);
    const type = icon.toString("ascii", offset + 4, offset + 8);
    const nextOffset = offset + 12 + length;
    if (nextOffset > icon.byteLength) return false;

    if (!hasHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = icon.readUInt32BE(offset + 8);
      const height = icon.readUInt32BE(offset + 12);
      if (width === 0 || height === 0) return false;
      hasHeader = true;
    } else if (type === "IDAT") {
      hasData = true;
    } else if (type === "IEND") {
      return length === 0 && hasData && nextOffset === icon.byteLength;
    }
    offset = nextOffset;
  }
  return false;
}

const ICON_EXTENSION_ALIASES = new Map([
  ["apng", "png"],
  ["dib", "bmp"],
  ["heif", "heic"],
  ["jpe", "jpg"],
  ["jpeg", "jpg"],
  ["jfif", "jpg"],
  ["tiff", "tif"],
]);

function normalizeIconExtension(extension: string): string {
  const normalized = extension.toLowerCase();
  return ICON_EXTENSION_ALIASES.get(normalized) ?? normalized;
}

async function resolvePluginIcon(root: string): Promise<
  | {
      filename: string;
      path: string;
    }
  | undefined
> {
  const candidates = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^icon\.[^.]+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) {
    throw new Error(
      `Extension root must contain at most one icon file: ${candidates.join(", ")}`,
    );
  }

  const sourceFilename = candidates[0];
  if (!sourceFilename) return undefined;
  const extension = path.extname(sourceFilename).slice(1).toLowerCase();
  const filename = `icon.${extension}`;
  const iconPath = path.join(root, sourceFilename);
  const icon = await readFile(iconPath);
  assertMaximum(filename, icon.byteLength, MAX_PLUGIN_ICON_BYTES);

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(icon);
  } catch {
    detected = undefined;
  }
  if (
    !detected?.mime.startsWith("image/") ||
    normalizeIconExtension(extension) !==
      normalizeIconExtension(detected.ext) ||
    (normalizeIconExtension(detected.ext) === "png" && !isPngRaster(icon))
  ) {
    throw new Error(
      `${filename} must be a valid raster image matching its file extension`,
    );
  }

  return { filename, path: iconPath };
}

function validateBundle(bundle: OutputBundle): void {
  const filenames = Object.keys(bundle).sort();
  const unexpected = filenames.filter(
    (filename) => filename !== "main.js" && filename !== "styles.css",
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Extension build emitted unexpected files: ${unexpected.join(", ")}`,
    );
  }

  const script = bundle["main.js"];
  if (!script || script.type !== "chunk" || !script.isEntry) {
    throw new Error("Extension build must emit one main.js entry");
  }
  assertMaximum(
    "main.js",
    Buffer.byteLength(script.code),
    MAX_PLUGIN_SCRIPT_BYTES,
  );
  const style = bundle["styles.css"];
  if (style) {
    if (style.type !== "asset") throw new Error("styles.css must be an asset");
    assertMaximum(
      "styles.css",
      byteLength(style.source),
      MAX_PLUGIN_STYLE_BYTES,
    );
  }
}

async function validateRuntimeDefinition(code: string): Promise<void> {
  const prelude = `
globalThis.addEventListener = function () {};
globalThis.devicePixelRatio = 1;
globalThis.global = globalThis;
globalThis.location = { origin: "https://extension.invalid" };
globalThis.navigator = { language: "en", languages: ["en"], platform: "", userAgent: "" };
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.console = { debug() {}, error() {}, info() {}, log() {}, warn() {} };
globalThis.crypto = {
  getRandomValues(value) { value.fill(0); return value; },
  randomUUID() { return "00000000-0000-4000-8000-000000000000"; },
};
globalThis.DOMException = class extends Error {};
globalThis.Element = class {};
globalThis.HTMLElement = globalThis.Element;
globalThis.SVGElement = globalThis.Element;
globalThis.Path2D = class { moveTo() {} lineTo() {} rect() {} arc() {} closePath() {} bezierCurveTo() {} quadraticCurveTo() {} addPath() {} };
const element = {
  addEventListener() {},
  appendChild() {},
  classList: { add() {}, remove() {} },
  getContext() { return {}; },
  remove() {},
  removeEventListener() {},
  setAttribute() {},
  style: {},
};
globalThis.document = {
  addEventListener() {},
  body: element,
  head: element,
  getElementsByTagName() { return [element]; },
  createTextNode() { return {}; },
  createElement() { return { ...element, style: {} }; },
  createElementNS() { return { ...element, style: {} }; },
  documentElement: element,
  removeEventListener() {},
};
globalThis.performance = { now() { return 0; } };
globalThis.MessageChannel = class {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage() {} };
  }
};
globalThis.clearTimeout = function () {};
globalThis.queueMicrotask = function () {};
globalThis.setTimeout = function () { return 0; };
`;
  const context = Object.assign(Object.create(null), {
    AbortController,
    TextEncoder,
    TextDecoder,
  });
  runInNewContext(`${prelude}\n${code}`, context, {
    contextCodeGeneration: { strings: false, wasm: false },
    timeout: 5_000,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    context.__LUNARIS_PLUGIN_BUILD_REGISTRATION__,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Extension runtime registration timed out")),
        RUNTIME_VALIDATION_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  if (!result || typeof result !== "object") {
    throw new Error("Extension runtime did not register");
  }
  if (result.error) {
    const error = new Error(String(result.error.message));
    error.name = String(result.error.name);
    throw error;
  }
}

function outputValidationPlugin({
  manifest,
  outDir,
  root,
}: {
  manifest: ReturnType<typeof validateManifest>;
  outDir: string;
  root: string;
}): Plugin {
  return {
    name: "lunaris-plugin-output-validation",
    async writeBundle(_options, bundle) {
      validateBundle(bundle);
      const script = bundle["main.js"];
      if (!script || script.type !== "chunk") {
        throw new Error("Extension build must emit one main.js entry");
      }
      await validateRuntimeDefinition(script.code);
      await mkdir(outDir, { recursive: true });
      await writeFile(
        path.join(outDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      await writeFile(
        path.join(outDir, "runtime.json"),
        `${JSON.stringify(PLUGIN_SANDBOX_RUNTIME, null, 2)}\n`,
      );

      const icon = await resolvePluginIcon(root);
      if (icon) {
        await copyFile(icon.path, path.join(outDir, icon.filename));
      }
    },
  };
}

export async function defineLunarisPluginConfig(
  options: LunarisPluginBuildOptions = {},
): Promise<UserConfig> {
  const root = path.resolve(options.root ?? process.cwd());
  const manifestPath = path.join(root, "manifest.json");
  const manifest = validateSupportedManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  if (options.expectedId && manifest.id !== options.expectedId) {
    throw new Error(
      `Extension ID "${manifest.id}" must match registry ID "${options.expectedId}"`,
    );
  }
  const tag = options.tag ?? process.env.GITHUB_REF_NAME;
  if (tag && tag !== manifest.version) {
    throw new Error(
      `Release tag "${tag}" must match extension version "${manifest.version}"`,
    );
  }

  const entry = path.resolve(root, options.entry ?? "src/index.tsx");
  const outDir = path.resolve(root, options.outDir ?? "dist");
  const sourceRoot = await realpath(root);
  return {
    plugins: [
      boundaryPlugin(entry, manifestPath, manifest.id, sourceRoot),
      singletonRuntimeValidationPlugin(),
      outputValidationPlugin({
        manifest,
        outDir,
        root,
      }),
    ],
    publicDir: false,
    resolve: {
      dedupe: [...SINGLETON_RUNTIME_DEPENDENCIES],
    },
    root,
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      emptyOutDir: true,
      minify: true,
      outDir,
      rollupOptions: {
        input: VIRTUAL_ENTRY,
        output: {
          assetFileNames: (asset) =>
            asset.name?.endsWith(".css")
              ? "styles.css"
              : "assets/[name]-[hash][extname]",
          entryFileNames: "main.js",
          format: "iife",
          name: `LunarisPlugin_${manifest.id.replace(/[^A-Za-z0-9_$]/g, "_")}`,
        },
      },
    },
  };
}
import { PLUGIN_SANDBOX_RUNTIME } from "./sandbox-protocol";
