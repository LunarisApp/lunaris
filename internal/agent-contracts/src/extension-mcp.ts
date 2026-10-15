import { kanbanMcpCapabilities } from "@extension/kanban/mcp";
import { richTextMcpCapabilities } from "@extension/rich-text/mcp";
import type * as z from "zod";
import { agentOperationContracts } from "./contracts";
import {
  type AgentOperationId,
  type AgentOperationOfflineAvailability,
  type AgentOperationRisk,
  agentOperationIds,
  agentOperations,
} from "./operations";
import {
  type AgentScope,
  agentScopeSchema,
} from "./schemas";
import type { AgentOperationWireDefinition } from "./wire";

type PluginMcpInputBinding = { from: string } | { value: unknown };

interface BuiltInPluginMcpToolBase {
  description: string;
  inputSchema: z.ZodObject;
  name: string;
  pluginId: string;
}

export interface BuiltInPluginMcpOperationTool
  extends BuiltInPluginMcpToolBase {
  execution: {
    input: Readonly<Record<string, PluginMcpInputBinding>>;
    kind: "operation";
    operation: AgentOperationId;
  };
}

export interface BuiltInPluginMcpProcedureTool
  extends BuiltInPluginMcpToolBase {
  execution: {
    kind: "plugin";
    offlineAvailability: AgentOperationOfflineAvailability;
    operation: string;
    risk: AgentOperationRisk;
    scope: AgentScope;
  };
  outputSchema: z.ZodObject;
}

export type BuiltInPluginMcpTool =
  | BuiltInPluginMcpOperationTool
  | BuiltInPluginMcpProcedureTool;

const builtInCapabilities = [
  kanbanMcpCapabilities,
  richTextMcpCapabilities,
] as const;
const operationIds = new Set<string>(agentOperationIds);
const pluginOperationPath =
  "/v1/organizations/{organizationId}/workspaces/{workspaceId}/plugins/{pluginId}/operations/{operation}";

export const builtInPluginMcpTools: readonly BuiltInPluginMcpTool[] =
  builtInCapabilities.flatMap((capabilities) => {
    validateHostCompatibility(capabilities);
    return capabilities.tools.map((tool) => {
      if ("outputSchema" in tool) {
        return {
          ...tool,
          execution: {
            ...tool.execution,
            scope: agentScopeSchema.parse(tool.execution.scope),
          },
          pluginId: capabilities.extensionId,
        } satisfies BuiltInPluginMcpProcedureTool;
      }
      if (!operationIds.has(tool.execution.operation)) {
        throw new TypeError(
          `Extension MCP tool "${tool.name}" delegates to unknown operation "${tool.execution.operation}"`
        );
      }
      const operationId = tool.execution.operation as AgentOperationId;
      const operationInput = agentOperationContracts[operationId].input;
      for (const target of Object.keys(tool.execution.input)) {
        if (!(target in operationInput.shape)) {
          throw new TypeError(
            `Extension MCP tool "${tool.name}" maps unknown "${operationId}" input "${target}"`
          );
        }
      }
      return {
        ...tool,
        execution: {
          ...tool.execution,
          operation: operationId,
        },
        pluginId: capabilities.extensionId,
      } satisfies BuiltInPluginMcpOperationTool;
    });
  });

assertUniqueToolNames(builtInPluginMcpTools);

export const agentMcpToolNames = [
  ...agentOperationIds,
  ...builtInPluginMcpTools.map(({ name }) => name),
] as const;

export function findBuiltInPluginMcpTool(
  name: string
): BuiltInPluginMcpTool | undefined {
  return builtInPluginMcpTools.find((tool) => tool.name === name);
}

export function findBuiltInPluginMcpProcedure(
  pluginId: string,
  operation: string,
): BuiltInPluginMcpProcedureTool | undefined {
  return builtInPluginMcpTools.find(
    (tool): tool is BuiltInPluginMcpProcedureTool =>
      isBuiltInPluginMcpProcedureTool(tool) &&
      tool.pluginId === pluginId &&
      tool.execution.operation === operation,
  );
}

export function isBuiltInPluginMcpOperationTool(
  tool: BuiltInPluginMcpTool,
): tool is BuiltInPluginMcpOperationTool {
  return tool.execution.kind === "operation";
}

export function isBuiltInPluginMcpProcedureTool(
  tool: BuiltInPluginMcpTool,
): tool is BuiltInPluginMcpProcedureTool {
  return tool.execution.kind === "plugin";
}

export function builtInPluginMcpToolRisk(
  tool: BuiltInPluginMcpTool
): AgentOperationRisk {
  return isBuiltInPluginMcpProcedureTool(tool)
    ? tool.execution.risk
    : agentOperations[tool.execution.operation].risk;
}

export function builtInPluginMcpToolScope(
  tool: BuiltInPluginMcpTool
): AgentScope {
  return isBuiltInPluginMcpProcedureTool(tool)
    ? tool.execution.scope
    : agentOperations[tool.execution.operation].scope;
}

export function builtInPluginMcpToolOutputSchema(
  tool: BuiltInPluginMcpTool
): z.ZodObject {
  return isBuiltInPluginMcpProcedureTool(tool)
    ? tool.outputSchema
    : agentOperationContracts[tool.execution.operation].output;
}

export function resolvePluginMcpInput(
  tool: BuiltInPluginMcpOperationTool,
  input: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(tool.execution.input).flatMap(([target, binding]) => {
      if ("value" in binding) return [[target, binding.value]];
      const value = input[binding.from];
      return value === undefined ? [] : [[target, value]];
    })
  );
}

export function pluginMcpWire(
  tool: BuiltInPluginMcpTool
): AgentOperationWireDefinition {
  if (isBuiltInPluginMcpProcedureTool(tool)) {
    const operationInput = Object.keys(tool.inputSchema.shape).filter(
      (key) =>
        ![
          "expectedRevision",
          "idempotencyKey",
          "workspaceId",
          "organizationId",
        ].includes(key),
    );
    const inputMapping = {
      fixed: {
        operation: tool.execution.operation,
        pluginId: tool.pluginId,
      },
    };
    if (tool.execution.risk === "read") {
      return {
        ...(operationInput.length > 0 ? { query: operationInput } : {}),
        inputMapping,
        method: "GET",
        path: pluginOperationPath,
      };
    }
    return {
      ...(operationInput.length > 0 ? { body: operationInput } : {}),
      headers: {
        expectedRevision: "If-Match",
        idempotencyKey: "Idempotency-Key",
      },
      inputMapping,
      method: "POST",
      path: pluginOperationPath,
    };
  }
  const operation = agentOperations[tool.execution.operation];
  const fixed: Record<string, unknown> = {};
  const renamed: Record<string, string> = {};
  for (const [target, binding] of Object.entries(tool.execution.input)) {
    if ("value" in binding) {
      fixed[target] = binding.value;
    } else if (binding.from !== target) {
      renamed[target] = binding.from;
    }
  }
  return {
    ...operation.transport,
    ...(Object.keys(fixed).length > 0 || Object.keys(renamed).length > 0
      ? {
          inputMapping: {
            ...(Object.keys(fixed).length > 0 ? { fixed } : {}),
            ...(Object.keys(renamed).length > 0 ? { renamed } : {}),
          },
        }
      : {}),
  };
}

function assertUniqueToolNames(tools: readonly BuiltInPluginMcpTool[]): void {
  const names = new Set<string>(agentOperationIds);
  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new TypeError(`Duplicate MCP tool: ${tool.name}`);
    }
    names.add(tool.name);
  }
}

function validateHostCompatibility(
  capabilities: (typeof builtInCapabilities)[number]
): void {
  for (const tool of capabilities.tools) {
    if (!("outputSchema" in tool)) continue;
    if (!agentScopeSchema.safeParse(tool.execution.scope).success) {
      throw new TypeError(
        `Extension MCP tool "${tool.name}" has unknown scope "${tool.execution.scope}"`,
      );
    }
    for (const contextInput of ["workspaceId", "organizationId"]) {
      if (!(contextInput in tool.inputSchema.shape)) {
        throw new TypeError(
          `Extension MCP tool "${tool.name}" needs "${contextInput}"`,
        );
      }
    }
    const risk = tool.execution.risk as AgentOperationRisk;
    if (risk !== "read" && !("idempotencyKey" in tool.inputSchema.shape)) {
      throw new TypeError(
        `Extension MCP tool "${tool.name}" needs "idempotencyKey"`,
      );
    }
  }
}
