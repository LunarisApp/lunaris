import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentWorkSmoke } from "./agent-work-smoke";

async function withAgent(
  output: string,
  run: (binary: string) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), "agent-smoke-test-"));
  const binary = join(directory, "agent");
  try {
    await writeFile(
      binary,
      `#!/bin/sh\nread -r command\nprintf '%s\\n' '${output}'\n`
    );
    await chmod(binary, 0o700);
    await run(binary);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("installed agent responds with state and status acknowledgement", async () => {
  await withAgent(
    '{"type":"state","state":{"models":[]}}\n{"type":"response","id":"smoke"}',
    async (binary) => {
      await runAgentWorkSmoke(binary);
    }
  );
});

test("agent status errors fail the release smoke check", async () => {
  await withAgent(
    '{"type":"response","id":"smoke","error":"runtime failed"}',
    async (binary) => {
      await expect(runAgentWorkSmoke(binary)).rejects.toThrow("runtime failed");
    }
  );
});

test("agent crashes fail the release smoke check", async () => {
  await withAgent("", async (binary) => {
    await expect(runAgentWorkSmoke(binary)).rejects.toThrow(
      "exited before status completed"
    );
  });
});
