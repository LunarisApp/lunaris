import { resolve } from "node:path";
import type { Plugin } from "vite";
import { readEdition } from "./edition";

export function editionPlugin(): Plugin {
  const edition = readEdition();
  return {
    name: "lunaris-edition",
    config() {
      return {
        resolve: {
          alias: [
            {
              find: "@app/edition",
              replacement: resolve(
                import.meta.dirname,
                "../..",
                edition === "enterprise"
                  ? "ee/composition/src/edition.tsx"
                  : "internal/features/src/organization/edition.tsx"
              ),
            },
          ],
        },
      };
    },
    moduleParsed(module) {
      if (edition === "community" && /[/\\]ee[/\\]/.test(module.id)) {
        this.error(`Enterprise module in community build: ${module.id}`);
      }
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "edition.json",
        source: JSON.stringify({ edition }),
      });
    },
  };
}
