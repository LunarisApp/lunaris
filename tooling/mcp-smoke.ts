import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OFFLINE_AVAILABILITY_KEY = "app.lunaris/offlineAvailability";
const PLUGIN_ID_KEY = "app.lunaris/pluginId";

export interface ExpectedMcpTool {
  name: string;
  offlineAvailability: string;
  pluginId?: string;
}

export interface ListedMcpTool {
  _meta?: Record<string, unknown>;
  name: string;
}

function duplicateNames(tools: readonly { name: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      duplicates.add(tool.name);
    }
    seen.add(tool.name);
  }
  return [...duplicates].sort();
}

export function validateMcpTools(
  actualTools: readonly ListedMcpTool[],
  expectedTools: readonly ExpectedMcpTool[],
): void {
  const actualByName = new Map(actualTools.map((tool) => [tool.name, tool]));
  const expectedByName = new Map(
    expectedTools.map((tool) => [tool.name, tool]),
  );
  const missing = [...expectedByName.keys()]
    .filter((name) => !actualByName.has(name))
    .sort();
  const extra = [...actualByName.keys()]
    .filter((name) => !expectedByName.has(name))
    .sort();
  const metadataMismatches: string[] = [];

  for (const [name, expected] of expectedByName) {
    const actual = actualByName.get(name);
    if (!actual) {
      continue;
    }
    const actualAvailability = actual._meta?.[OFFLINE_AVAILABILITY_KEY];
    if (actualAvailability !== expected.offlineAvailability) {
      metadataMismatches.push(
        `${name}.${OFFLINE_AVAILABILITY_KEY} expected=${expected.offlineAvailability} actual=${String(actualAvailability)}`,
      );
    }
    const actualPluginId = actual._meta?.[PLUGIN_ID_KEY];
    if (actualPluginId !== expected.pluginId) {
      metadataMismatches.push(
        `${name}.${PLUGIN_ID_KEY} expected=${String(expected.pluginId)} actual=${String(actualPluginId)}`,
      );
    }
  }

  const differences: string[] = [];
  const addDifference = (label: string, values: string[]) => {
    if (values.length > 0) {
      differences.push(`${label}=[${values.join(", ")}]`);
    }
  };
  addDifference("missing", missing);
  addDifference("extra", extra);
  addDifference("duplicate actual", duplicateNames(actualTools));
  addDifference("duplicate expected", duplicateNames(expectedTools));
  addDifference("metadata", metadataMismatches.sort());

  if (differences.length > 0) {
    throw new Error(`MCP tool manifest mismatch: ${differences.join("; ")}`);
  }
}

async function expectedMcpTools(): Promise<ExpectedMcpTool[]> {
  const manifestPath = join(
    import.meta.dir,
    "../internal/agent-contracts/generated/agent-mcp-manifest.json",
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    tools: ExpectedMcpTool[];
  };
  return manifest.tools;
}

export async function runMcpSmoke(args = process.argv.slice(2)): Promise<void> {
  const binary = args[0];
  if (!binary) {
    throw new Error(
      "Usage: bun tooling/mcp-smoke.ts <binary> [expected-server-name]",
    );
  }

  const expectedServerName = args[1] ?? "lunaris-cli";
  const expectedTools = await expectedMcpTools();
  const child = spawn(binary, ["mcp", "serve"], {
    env: {
      ...process.env,
      LUNARIS_API_KEY: "lun_smoke",
      LUNARIS_CONFIG_PATH: join(
        tmpdir(),
        `lunaris-mcp-smoke-${process.pid}-${Date.now()}.json`,
      ),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let buffer = "";
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "smoke", version: "1" },
        protocolVersion: "2025-11-25",
      },
    })}\n`,
  );

  const timeout = setTimeout(() => child.kill(), 5_000);
  try {
    for await (const chunk of child.stdout) {
      stdout += String(chunk);
      buffer += String(chunk);
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) {
          continue;
        }
        const response = JSON.parse(line) as {
          id?: number;
          result?: {
            serverInfo?: { name?: string };
            tools?: ListedMcpTool[];
          };
        };
        if (
          response.id === 1 &&
          response.result?.serverInfo?.name === expectedServerName
        ) {
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
            })}\n`,
          );
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            })}\n`,
          );
          continue;
        }
        if (response.id === 2 && response.result?.tools) {
          validateMcpTools(response.result.tools, expectedTools);
          return;
        }
        const stderrSummary = stderr.trim().split("\n").at(-1);
        throw new Error(
          `Unexpected MCP response id=${String(response.id)}${stderrSummary ? `; stderr=${stderrSummary}` : ""}`,
        );
      }
    }
    throw new Error(
      `MCP server exited without initialization; stdout-bytes=${stdout.length}; stderr=${stderr.trim()}`,
    );
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
}

if (import.meta.main) {
  await runMcpSmoke();
}
