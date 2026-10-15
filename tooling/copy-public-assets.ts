import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const [sourceArgument, destinationArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument) {
  throw new Error("Usage: copy-public-assets <source> <destination>");
}

const sourceRoot = path.resolve(sourceArgument);
const destinationRoot = path.resolve(destinationArgument);
const assetExtensions = new Set([".css"]);

async function copyAssets(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await copyAssets(source);
      continue;
    }
    if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const destination = path.join(
      destinationRoot,
      path.relative(sourceRoot, source),
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

await copyAssets(sourceRoot);
