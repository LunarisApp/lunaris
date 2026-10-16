import { readEdition } from "../editions/edition";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Plugin } from "vite";
import { collectNotices } from "./notices";

const root = join(import.meta.dirname, "../..");

/** Share the module inventory with worker builds, including CSS and WASM imports. */
export function distributionNotices(options: { serviceWorker?: boolean } = {}) {
  let additionalModules: string[] = [];
  const modules = new Set<string>();
  const inventory = (): Plugin => ({
    name: "lunaris-notice-inventory",
    apply: "build",
    moduleParsed(module) {
      modules.add(module.id);
    },
  });
  const plugin: Plugin = {
    ...inventory(),
    name: "lunaris-distribution-notices",
    configResolved(config) {
      if (!options.serviceWorker) {
        return;
      }
      const appRequire = createRequire(join(config.root, "package.json"));
      const pwaRequire = createRequire(appRequire.resolve("vite-plugin-pwa"));
      const workboxRequire = createRequire(pwaRequire.resolve("workbox-build"));
      const manifest = JSON.parse(
        readFileSync(
          workboxRequire.resolve("workbox-build/package.json"),
          "utf8"
        )
      ) as { dependencies: Record<string, string> };
      additionalModules = Object.keys(manifest.dependencies)
        .filter((name) => name.startsWith("workbox-"))
        .map((name) => workboxRequire.resolve(`${name}/package.json`));
    },
    buildStart() {
      modules.clear();
    },
    generateBundle(_options, bundle) {
      if (readEdition() === "enterprise") {
        this.emitFile({
          type: "asset",
          fileName: "EE-LICENSE.txt",
          source: readFileSync(join(root, "ee/LICENSE"), "utf8"),
        });
      }
      for (const entry of Object.values(bundle)) {
        if (entry.type === "chunk") {
          for (const id of entry.moduleIds) {
            modules.add(id);
          }
        }
      }
      this.emitFile({
        type: "asset",
        fileName: "THIRD-PARTY-LICENSES.md",
        source: collectNotices([...modules, ...additionalModules], root),
      });
      for (const [fileName, path] of [
        ["LICENSE", "LICENSE"],
        ["THIRD-PARTY-NOTICES.md", "THIRD-PARTY-NOTICES.md"],
        [
          "EXTEND-LICENSE.txt",
          "extensions/file/src/components/extend/LICENSE.md",
        ],
      ] as const) {
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(join(root, path), "utf8"),
        });
      }
    },
  };
  return { plugin, workerPlugins: () => [inventory()] };
}
