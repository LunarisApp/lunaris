import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

/** Exercise the installed Bun runtime without credentials or network requests. */
export async function runAgentWorkSmoke(binary: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "lunaris-agent-smoke-"));
  const child = spawn(binary, [directory], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-8192);
  });
  const exited = new Promise<void>((resolve) =>
    child.once("close", () => resolve())
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let receivedState = false;
      timer = setTimeout(
        () => reject(new Error("Agent status timed out")),
        15_000
      );
      child.once("error", reject);
      child.stdin.on("error", reject);
      child.once("close", (code) => {
        reject(
          new Error(`Agent exited before status completed (${code}): ${stderr}`)
        );
      });
      lines.on("line", (line) => {
        if (!line.trim()) {
          return;
        }
        try {
          const event = JSON.parse(line) as {
            type: string;
            id?: string;
            error?: string;
            state?: { models?: unknown[] };
          };
          if (event.type === "state" && Array.isArray(event.state?.models)) {
            receivedState = true;
          } else if (event.type === "response" && event.id === "smoke") {
            if (event.error || !receivedState) {
              reject(new Error(event.error ?? "Agent returned no state"));
            } else {
              resolve();
            }
          } else if (event.type === "error") {
            reject(new Error(`Agent failed: ${line}`));
          }
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.write(`${JSON.stringify({ type: "status", id: "smoke" })}\n`);
    });
  } finally {
    clearTimeout(timer);
    lines.close();
    child.kill("SIGKILL");
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const binary = process.argv[2];
  if (!binary) {
    throw new Error("Usage: bun tooling/delivery/agent-work-smoke.ts <binary>");
  }
  await runAgentWorkSmoke(binary);
}
