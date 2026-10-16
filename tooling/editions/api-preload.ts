import { plugin } from "bun";
import { resolve } from "node:path";
import { readEdition } from "./edition";

// Keep Bun's normal tsconfig discovery: --tsconfig-override breaks Nest's
// legacy decorators in Bun 1.3.14. Override only the edition module at runtime.
if (readEdition() === "enterprise") {
  const community = resolve(
    import.meta.dirname,
    "../../apps/api/src/edition/community.ts"
  );
  const enterprise = resolve(
    import.meta.dirname,
    "../../apps/api/src/enterprise/edition.ts"
  );
  await plugin({
    name: "api-edition",
    setup(build) {
      // Bun resolves tsconfig path aliases before runtime onResolve hooks.
      build.onLoad({ filter: /[\\/]edition[\\/]community\.ts$/ }, (args) => {
        if (args.path !== community) {
          return;
        }
        return {
          contents: `export * from ${JSON.stringify(enterprise)};`,
          loader: "ts",
        };
      });
    },
  });
}
