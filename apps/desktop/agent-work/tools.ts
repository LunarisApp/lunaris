import {
  agentOperationContracts,
  agentOperations,
  builtInPluginMcpTools,
  builtInPluginMcpToolRisk,
  pluginMcpWire,
  serializeAgentOperation,
  serializeAgentWire,
} from "@repo/agent-contracts";
import * as z from "zod";

const readOperations = [
  "list_workspaces",
  "get_workspace",
  "list_resources",
  "get_resource",
  "search_resources",
] as const;

// Deliberate allowlist: resource tools only; no organization administration,
// local filesystem, shell, arbitrary networking, or discovered Pi extensions.
export const resourceTools = [
  ...readOperations.map((name) => ({
    name,
    description: agentOperations[name].description,
    schema: agentOperationContracts[name].input,
    mutation: false,
    serialize: (input: Record<string, unknown>) =>
      serializeAgentOperation(name, input),
  })),
  ...builtInPluginMcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
    mutation: builtInPluginMcpToolRisk(tool) !== "read",
    serialize: (input: Record<string, unknown>) =>
      serializeAgentWire(pluginMcpWire(tool), input),
  })),
];

export function resourceToolDefinitions() {
  return resourceTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(
      z.object(
        Object.fromEntries(
          Object.entries(tool.schema.shape).filter(
            ([key]) => key !== "organizationId"
          )
        )
      ),
      { target: "draft-7" }
    ),
  }));
}

export function resolveResourceTool(
  name: string,
  rawInput: Record<string, unknown>,
  organizationId: string
) {
  const tool = resourceTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error("Unknown resource tool");
  }
  const input = tool.schema.parse({ ...rawInput, organizationId });
  return { mutation: tool.mutation, request: tool.serialize(input) };
}
