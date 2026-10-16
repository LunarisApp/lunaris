import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import ts from "typescript";

interface ExportTarget {
  import?: string;
  types?: string;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  exports: Record<string, ExportTarget | string>;
  files: string[];
  license: string;
  name: string;
  peerDependencies?: Record<string, string>;
  private: boolean;
  publishConfig: { access: string };
  repository: { directory: string; type: string; url: string };
  version: string;
}

interface PublicPackage {
  directory: "packages/plugin-sdk" | "packages/ui";
  name: "@lunarisapp/plugin-sdk" | "@lunarisapp/ui";
}

const root = resolve(import.meta.dir, "..");
const updateReports = process.argv.includes("--update-reports");
const skipFixture = process.argv.includes("--skip-fixture");
const packages: PublicPackage[] = [
  { directory: "packages/ui", name: "@lunarisapp/ui" },
  { directory: "packages/plugin-sdk", name: "@lunarisapp/plugin-sdk" },
];

function run(command: string, args: string[], cwd = root): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`
    );
  }
  return result.stdout.trim();
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
}

function typeTarget(target: ExportTarget | string): string | undefined {
  return typeof target === "string" ? undefined : target.types;
}

function runtimeTarget(target: ExportTarget | string): string {
  return typeof target === "string" ? target : (target.import ?? "");
}

function packageName(specifier: string): string {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : (segments[0] ?? specifier);
}

function createApiReport(
  packageDirectory: string,
  manifest: PackageManifest
): string {
  const entrypoints = Object.entries(manifest.exports).map(
    ([entrypoint, target]) => {
      const types = typeTarget(target);
      if (!types) {
        return { entrypoint, runtime: runtimeTarget(target) };
      }

      const declarationPath = resolve(packageDirectory, types);
      const program = ts.createProgram([declarationPath], {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
      });
      const source = program.getSourceFile(declarationPath);
      const symbol =
        source && program.getTypeChecker().getSymbolAtLocation(source);
      const symbols = symbol
        ? program
            .getTypeChecker()
            .getExportsOfModule(symbol)
            .map(({ name }) => name)
            .sort()
        : [];
      return {
        entrypoint,
        runtime: runtimeTarget(target),
        symbols,
        types,
      };
    }
  );

  return `${JSON.stringify({ name: manifest.name, entrypoints }, null, 2)}\n`;
}

function validateManifest(
  packageDirectory: string,
  expected: PublicPackage,
  manifest: PackageManifest
) {
  if (manifest.name !== expected.name) {
    throw new Error(`${expected.directory}: unexpected name ${manifest.name}`);
  }
  if (manifest.private !== false || manifest.license !== "MIT") {
    throw new Error(`${manifest.name}: package must be public and MIT`);
  }
  if (manifest.publishConfig?.access !== "public") {
    throw new Error(`${manifest.name}: publishConfig.access must be public`);
  }
  if (manifest.repository?.directory !== expected.directory) {
    throw new Error(`${manifest.name}: repository.directory is incorrect`);
  }
  if (
    JSON.stringify(manifest.files) !==
    JSON.stringify(["dist", "LICENSE", "README.md"])
  ) {
    throw new Error(
      `${manifest.name}: files must contain only dist, LICENSE, README.md`
    );
  }
  if (!existsSync(resolve(packageDirectory, "LICENSE"))) {
    throw new Error(`${manifest.name}: missing package-local LICENSE`);
  }

  for (const [entrypoint, target] of Object.entries(manifest.exports)) {
    const targets = [typeTarget(target), runtimeTarget(target)].filter(Boolean);
    for (const relativeTarget of targets) {
      if (
        relativeTarget?.includes("/src/") ||
        relativeTarget?.startsWith("./src")
      ) {
        throw new Error(
          `${manifest.name} ${entrypoint}: source export ${relativeTarget}`
        );
      }
      if (
        !(
          relativeTarget &&
          existsSync(resolve(packageDirectory, relativeTarget))
        )
      ) {
        throw new Error(
          `${manifest.name} ${entrypoint}: missing ${relativeTarget}`
        );
      }
    }
  }

  const manifestText = JSON.stringify(manifest);
  if (manifestText.includes("workspace:") || manifestText.includes("@repo/")) {
    throw new Error(
      `${manifest.name}: publish manifest contains a private dependency`
    );
  }

  const declaredDependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  for (const file of listFiles(resolve(packageDirectory, "dist"))) {
    const isCode = /\.(?:[cm]?js|json|map|ts)$/.test(file);
    const isStylesheet = file.endsWith(".css");
    if (!(isCode || isStylesheet)) {
      continue;
    }

    const contents = readFileSync(file, "utf8");
    const hasPrivateWorkspaceProtocol = /["']workspace:(?:\*|\^|~|\d)/.test(
      contents
    );
    if (
      isCode &&
      (contents.includes("@repo/") || hasPrivateWorkspaceProtocol)
    ) {
      throw new Error(`${manifest.name}: private reference in ${file}`);
    }

    if (!isStylesheet) {
      continue;
    }
    for (const match of contents.matchAll(
      /@(?:import|reference)\s+["']([^"']+)["']/g
    )) {
      const specifier = match[1];
      if (
        !specifier ||
        specifier.startsWith(".") ||
        specifier.startsWith("/")
      ) {
        continue;
      }
      const dependency = packageName(specifier);
      if (!declaredDependencies.has(dependency)) {
        throw new Error(
          `${manifest.name}: undeclared CSS dependency ${dependency} in ${file}`
        );
      }
    }
  }
}

function packPackage(
  tempDirectory: string,
  packageDirectory: string,
  manifest: PackageManifest
): string {
  const result = JSON.parse(
    run(
      "npm",
      ["pack", "--json", "--pack-destination", tempDirectory],
      packageDirectory
    )
  ) as Array<{ filename: string }>;
  const filename = result[0]?.filename;
  if (!filename) {
    throw new Error(`${manifest.name}: npm pack returned no tarball`);
  }
  const tarball = resolve(tempDirectory, filename);
  const entries = run("tar", ["-tzf", tarball]).split("\n");
  const invalid = entries.filter(
    (entry) =>
      entry.includes("/src/") ||
      entry.endsWith("/tsconfig.json") ||
      entry.endsWith("/tsconfig.build.json") ||
      entry.includes("/test-utils/")
  );
  if (invalid.length > 0) {
    throw new Error(
      `${manifest.name}: invalid packed files:\n${invalid.join("\n")}`
    );
  }
  return tarball;
}

function validateTooling(
  packageDirectory: string,
  packageInfo: PublicPackage,
  tarball: string
) {
  run("bunx", ["publint", packageDirectory]);
  const attwArgs = [
    "attw",
    tarball,
    "--profile",
    "esm-only",
    "--ignore-rules",
    "internal-resolution-error",
  ];
  if (packageInfo.name === "@lunarisapp/ui") {
    attwArgs.push(
      "--exclude-entrypoints",
      "@lunarisapp/ui/globals.css",
      "@lunarisapp/ui/workbench.css"
    );
  }
  run("bunx", attwArgs);
}

function createExtensionFixture(
  fixture: string,
  sdkTarball: string,
  uiTarball: string
) {
  const files = new Map<string, string>([
    [
      "package.json",
      `${JSON.stringify(
        {
          name: "lunaris-extension-fixture",
          version: "1.0.0",
          private: true,
          type: "module",
          scripts: { build: "vite build", typecheck: "tsc --noEmit" },
          dependencies: {
            "@lunarisapp/plugin-sdk": `file:${sdkTarball}`,
            "@lunarisapp/ui": `file:${uiTarball}`,
            react: "^19.2.8",
          },
          devDependencies: {
            "@types/node": "^26.1.2",
            "@types/react": "^19.2.18",
            typescript: "^7.0.2",
            vite: "^8.2.0",
          },
          overrides: { "@lunarisapp/ui": `file:${uiTarball}` },
        },
        null,
        2
      )}\n`,
    ],
    [
      "manifest.json",
      `${JSON.stringify(
        {
          id: "example.notes",
          name: "Example Notes",
          description: "Extension package validation fixture",
          developer: "Lunaris",
          version: "1.0.0",
          api: "^0.9.0",
          permissions: [],
        },
        null,
        2
      )}\n`,
    ],
    [
      "src/index.tsx",
      `import { definePlugin, defineView } from "@lunarisapp/plugin-sdk";
import { runPluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import TaskWorker from "./task.worker?worker&inline";
import manifest from "../manifest.json";

export const runTask = (input: number) =>
  runPluginWorkerTask<number, number>(() => new TaskWorker(), input);

export default definePlugin({
  manifest,
  activate({ contributions }) {
    contributions.view(defineView({
      icon: [["path", { d: "M4 4h16v16H4z" }]],
      viewId: "example.notes",
      name: "Example Notes",
      renderer: () => <div>Fixture</div>,
      target: {
        kind: "standalone",
        launcher: { defaultPlacement: "primary" },
      },
    }));
  },
});
`,
    ],
    [
      "src/task.worker.ts",
      `import { exposePluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";

exposePluginWorkerTask((input: number) => input * 2);
`,
    ],
    [
      "src/vite-env.d.ts",
      `declare module "*?worker&inline" {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}
`,
    ],
    [
      "tsconfig.json",
      `${JSON.stringify(
        {
          compilerOptions: {
            jsx: "react-jsx",
            resolveJsonModule: true,
            lib: ["DOM", "ESNext"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: "ES2022",
          },
          include: ["src", "vite.config.ts"],
        },
        null,
        2
      )}\n`,
    ],
    [
      "vite.config.ts",
      `import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";

export default defineLunarisPluginConfig({ tag: "1.0.0" });
`,
    ],
  ]);

  for (const [file, contents] of files) {
    const path = resolve(fixture, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function validateFixture(tempDirectory: string, tarballs: Map<string, string>) {
  const fixture = resolve(tempDirectory, "minimal-extension");
  const sdkTarball = tarballs.get("@lunarisapp/plugin-sdk");
  const uiTarball = tarballs.get("@lunarisapp/ui");
  if (!(sdkTarball && uiTarball)) {
    throw new Error("Missing public package tarballs");
  }
  createExtensionFixture(fixture, sdkTarball, uiTarball);
  run("bun", ["install", "--ignore-scripts"], fixture);
  run("bun", ["run", "typecheck"], fixture);
  run("bun", ["run", "build"], fixture);
  let output = readdirSync(resolve(fixture, "dist")).sort();
  if (
    JSON.stringify(output) !==
    JSON.stringify(["main.js", "manifest.json", "runtime.json"])
  ) {
    throw new Error(
      `Unexpected extension fixture output: ${output.join(", ")}`
    );
  }

  rmSync(resolve(fixture, "dist"), { force: true, recursive: true });
  writeFileSync(
    resolve(fixture, "vite.config.ts"),
    'throw new Error("Extension-owned Vite config must not run in registry CI");\n'
  );
  const registryConfig = resolve(fixture, "registry.vite.config.ts");
  writeFileSync(
    registryConfig,
    `import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";

const root = process.env.PLUGIN_ROOT;
const expectedId = process.env.PLUGIN_EXPECTED_ID;
const tag = process.env.PLUGIN_RELEASE_TAG;
if (!root || !expectedId || !tag) throw new Error("Missing registry build input");

export default defineLunarisPluginConfig({ expectedId, root, tag });
`
  );
  run("env", [
    `PLUGIN_ROOT=${fixture}`,
    "PLUGIN_EXPECTED_ID=example.notes",
    "PLUGIN_RELEASE_TAG=1.0.0",
    "bunx",
    "vite",
    "build",
    "--config",
    registryConfig,
  ]);
  output = readdirSync(resolve(fixture, "dist")).sort();
  if (
    JSON.stringify(output) !==
    JSON.stringify(["main.js", "manifest.json", "runtime.json"])
  ) {
    throw new Error(`Unexpected trusted registry output: ${output.join(", ")}`);
  }
}

const temporaryDirectory = mkdtempSync(
  resolve(tmpdir(), "lunaris-public-packages-")
);
const tarballs = new Map<string, string>();

try {
  for (const packageInfo of packages) {
    const packageDirectory = resolve(root, packageInfo.directory);
    run("bun", ["run", "build"], packageDirectory);
    const manifest = readJson<PackageManifest>(
      resolve(packageDirectory, "package.json")
    );
    validateManifest(packageDirectory, packageInfo, manifest);

    const reportPath = resolve(packageDirectory, "api-report.json");
    const nextReport = createApiReport(packageDirectory, manifest);
    if (updateReports) {
      writeFileSync(reportPath, nextReport);
    } else if (
      !existsSync(reportPath) ||
      readFileSync(reportPath, "utf8") !== nextReport
    ) {
      throw new Error(
        `${manifest.name}: API report is stale; run bun run public:reports`
      );
    }

    const tarball = packPackage(temporaryDirectory, packageDirectory, manifest);
    tarballs.set(manifest.name, tarball);
    validateTooling(packageDirectory, packageInfo, tarball);
    console.log(`Validated ${manifest.name} (${basename(tarball)})`);
  }

  if (!skipFixture) {
    validateFixture(temporaryDirectory, tarballs);
    console.log("Validated isolated minimal-extension fixture");
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
