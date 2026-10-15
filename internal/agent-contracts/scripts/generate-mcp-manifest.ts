import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";
import { agentOperationContracts } from "../src/contracts";
import {
  agentOperationIds,
  agentOperations,
} from "../src/operations";
import {
  type BuiltInPluginMcpProcedureTool,
  builtInPluginMcpTools,
  isBuiltInPluginMcpOperationTool,
  pluginMcpWire,
} from "../src/extension-mcp";
import { agentResourceDefinitions } from "../src/resources";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  packageDirectory,
  "generated/agent-mcp-manifest.json",
);

export function createMcpManifest() {
  return {
    schemaVersion: 2,
    resources: agentResourceDefinitions,
    tools: [
      ...agentOperationIds.map((id) => {
        const operation = agentOperations[id];
        return toolManifest({
          description: operation.description,
          input: agentOperationContracts[id].input,
          name: id,
          operationId: id,
          wire: operation.transport,
        });
      }),
      ...builtInPluginMcpTools.map((tool) =>
        isBuiltInPluginMcpOperationTool(tool)
          ? toolManifest({
              description: tool.description,
              input: tool.inputSchema,
              name: tool.name,
              operationId: tool.execution.operation,
              pluginId: tool.pluginId,
              wire: pluginMcpWire(tool),
            })
          : pluginToolManifest(tool),
      ),
    ],
  };
}

function pluginToolManifest(
  tool: BuiltInPluginMcpProcedureTool,
) {
  return {
    annotations: {
      destructiveHint: tool.execution.risk === "destructive",
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: tool.execution.risk === "read",
    },
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema, {
      io: "input",
      target: "draft-2020-12",
    }),
    name: tool.name,
    offlineAvailability: tool.execution.offlineAvailability,
    outputSchema: z.toJSONSchema(tool.outputSchema, {
      io: "output",
      target: "draft-2020-12",
    }),
    pluginId: tool.pluginId,
    scope: tool.execution.scope,
    wire: pluginMcpWire(tool),
  };
}

function toolManifest(input: {
  description: string;
  input: z.ZodType;
  name: string;
  operationId: (typeof agentOperationIds)[number];
  pluginId?: string;
  wire: unknown;
}) {
  const operation = agentOperations[input.operationId];
  return {
    annotations: {
      destructiveHint: operation.risk === "destructive",
      idempotentHint: !input.operationId.startsWith("preview_"),
      openWorldHint: false,
      readOnlyHint: operation.risk === "read",
    },
    description: input.description,
    inputSchema: z.toJSONSchema(input.input, {
      io: "input",
      target: "draft-2020-12",
    }),
    name: input.name,
    offlineAvailability: operation.offlineAvailability,
    outputSchema: z.toJSONSchema(
      agentOperationContracts[input.operationId].output,
      {
        io: "output",
        target: "draft-2020-12",
      }
    ),
    ...(input.pluginId ? { pluginId: input.pluginId } : {}),
    scope: operation.scope,
    wire: input.wire,
  };
}

const generated = `${JSON.stringify(createMcpManifest(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== generated) {
    throw new Error(
      "Generated MCP manifest is stale. Run `bun run generate:mcp` in internal/agent-contracts.",
    );
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated);
}
