import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Pi's compiled runtime reads its package metadata from disk on import.
// Keep the bundled metadata in this account's private runtime directory.
import metadata from "../node_modules/@mariozechner/pi-coding-agent/package.json";
const directory = process.argv[2];
if (!directory) throw new Error("Agent Work storage directory is required");
process.umask(0o077);
const packageDirectory = join(directory, "runtime");
mkdirSync(packageDirectory, { recursive: true, mode: 0o700 });
writeFileSync(
  join(packageDirectory, "package.json"),
  JSON.stringify(metadata),
  { mode: 0o600 },
);
process.env.PI_PACKAGE_DIR = packageDirectory;
const { AgentWorkRuntime } = await import("./runtime");
const runtime = new AgentWorkRuntime(directory, (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
});
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  try {
    void runtime.handle(JSON.parse(line));
  } catch {
    process.stdout.write(
      `${JSON.stringify({ type: "error", message: "Invalid command" })}\n`,
    );
  }
});
input.on("close", () => process.exit(0));
