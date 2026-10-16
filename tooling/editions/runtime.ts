import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { readEdition, type Edition } from "./edition";

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
};
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** Assemble only the API's workspace dependency closure and optional built web assets. */
export function assembleRuntime(
  root: string,
  destination: string,
  edition: Edition,
  includeWeb = true
) {
  if (existsSync(destination)) {
    throw new Error("Runtime destination must not exist");
  }
  for (const app of includeWeb ? ["api", "web"] : ["api"]) {
    if (
      readJson(join(root, `apps/${app}/dist/edition.json`)).edition !== edition
    ) {
      throw new Error(`Edition mismatch in ${app} output`);
    }
  }
  const packages = new Map<string, { path: string; manifest: Manifest }>();
  for (const group of ["apps", "internal", "packages", "extensions", "ee"]) {
    if (!existsSync(join(root, group))) {
      continue;
    }
    for (const name of readdirSync(join(root, group))) {
      const path = `${group}/${name}`;
      if (existsSync(join(root, path, "package.json"))) {
        const manifest: Manifest = readJson(join(root, path, "package.json"));
        packages.set(manifest.name, { path, manifest });
      }
    }
  }
  const selected = new Set<string>();
  const visit = (name: string) => {
    if (selected.has(name)) {
      return;
    }
    const workspace = packages.get(name);
    if (!workspace) {
      throw new Error(`Missing workspace: ${name}`);
    }
    if (edition === "community" && workspace.path.startsWith("ee/")) {
      throw new Error(`Enterprise dependency in community runtime: ${name}`);
    }
    selected.add(name);
    for (const [dependency, version] of Object.entries({
      ...workspace.manifest.dependencies,
      ...workspace.manifest.optionalDependencies,
      ...workspace.manifest.peerDependencies,
    })) {
      // The API's optional edition implementation is deliberately absent in CE.
      if (
        edition === "community" &&
        name === "api" &&
        ["@repo/ee-audit", "@repo/ee-teams"].includes(dependency)
      ) {
        continue;
      }
      if (version.startsWith("workspace:")) {
        visit(dependency);
      }
    }
  };
  visit("api");
  mkdirSync(destination, { recursive: true });
  const copy = (path: string) =>
    cpSync(join(root, path), join(destination, path), {
      recursive: true,
      filter(source) {
        const name = basename(source);
        return !(
          ["node_modules", ".turbo", "coverage", "test", "__tests__"].includes(
            name
          ) ||
          /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) ||
          name.startsWith(".env") ||
          name.endsWith(".tsbuildinfo")
        );
      },
    });
  for (const name of selected) {
    const workspace = packages.get(name)!;
    if (name === "api") {
      copy("apps/api/dist");
      copy("apps/api/drizzle");
    } else {
      copy(workspace.path);
    }
    const manifest = { ...workspace.manifest };
    delete manifest.devDependencies;
    delete manifest.scripts;
    if (edition === "community" && name === "api") {
      manifest.dependencies = { ...manifest.dependencies };
      delete manifest.dependencies["@repo/ee-audit"];
      delete manifest.dependencies["@repo/ee-teams"];
    }
    writeFileSync(
      join(destination, workspace.path, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }
  if (includeWeb) {
    copy("apps/web/dist");
  }
  for (const file of ["LICENSE", "THIRD-PARTY-NOTICES.md", "bun.lock"]) {
    copy(file);
  }
  if (edition === "enterprise") {
    copy("ee/LICENSE");
  }
  const original = readJson(join(root, "package.json"));
  writeFileSync(
    join(destination, "package.json"),
    `${JSON.stringify(
      {
        name: "lunaris-runtime",
        private: true,
        workspaces: [...selected].map((name) => packages.get(name)!.path),
        overrides: original.overrides,
      },
      null,
      2
    )}\n`
  );
}

if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) {
    throw new Error("Provide a new runtime destination directory");
  }
  assembleRuntime(
    resolve(import.meta.dirname, "../.."),
    resolve(destination),
    readEdition(),
    process.argv[3] !== "--api-only"
  );
}
