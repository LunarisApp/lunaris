import type * as z from "zod";
import type { JsonValue } from "./json";

export type PluginMcpInputBinding = { from: string } | { value: JsonValue };

export interface PluginMcpOperationExecution {
  input: Readonly<Record<string, PluginMcpInputBinding>>;
  kind: "operation";
  operation: string;
}

export type PluginMcpOfflineAvailability = "cloud-required" | "supported";
export type PluginMcpRisk = "destructive" | "read" | "write";

export interface PluginMcpProcedureExecution {
  kind: "plugin";
  offlineAvailability: PluginMcpOfflineAvailability;
  operation: string;
  risk: PluginMcpRisk;
  scope: string;
}

interface PluginMcpToolBase {
  description: string;
  inputSchema: z.ZodObject;
  name: string;
}

export interface PluginMcpOperationTool extends PluginMcpToolBase {
  execution: PluginMcpOperationExecution;
}

export interface PluginMcpProcedureTool extends PluginMcpToolBase {
  execution: PluginMcpProcedureExecution;
  outputSchema: z.ZodObject;
}

export type PluginMcpTool = PluginMcpOperationTool | PluginMcpProcedureTool;

export interface PluginMcpCapabilities {
  extensionId: string;
  tools: readonly PluginMcpTool[];
}

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Defines runtime-neutral MCP tools owned by an extension.
 *
 * Tools may delegate to stable Lunaris operations or name an extension-owned
 * procedure. Hosts execute procedures behind this declarative boundary so a
 * future external-extension sandbox can implement the same contract.
 */
export function definePluginMcpCapabilities<
  const Capabilities extends PluginMcpCapabilities,
>(capabilities: Capabilities): Capabilities {
  if (!capabilities.extensionId.trim()) {
    throw new TypeError("Extension MCP capabilities require an extension ID");
  }

  const names = new Set<string>();
  for (const tool of capabilities.tools) {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      throw new TypeError(
        `Extension MCP tool "${tool.name}" must use lowercase letters, numbers, and underscores`
      );
    }
    if (names.has(tool.name)) {
      throw new TypeError(`Duplicate extension MCP tool: ${tool.name}`);
    }
    names.add(tool.name);
    if (!tool.description.trim()) {
      throw new TypeError(
        `Extension MCP tool "${tool.name}" needs a description`
      );
    }
    if (!tool.execution.operation.trim()) {
      throw new TypeError(
        `Extension MCP tool "${tool.name}" needs an operation`
      );
    }
    if (tool.execution.kind === "plugin") {
      if (!tool.execution.scope.trim()) {
        throw new TypeError(`Extension MCP tool "${tool.name}" needs a scope`);
      }
      continue;
    }
    const sources = new Set<string>();
    for (const [target, binding] of Object.entries(tool.execution.input)) {
      if (!target.trim()) {
        throw new TypeError(
          `Extension MCP tool "${tool.name}" has an empty operation input`
        );
      }
      if ("from" in binding) {
        if (!binding.from.trim()) {
          throw new TypeError(
            `Extension MCP tool "${tool.name}" has an empty input source`
          );
        }
        if (!(binding.from in tool.inputSchema.shape)) {
          throw new TypeError(
            `Extension MCP tool "${tool.name}" maps unknown input "${binding.from}"`
          );
        }
        sources.add(binding.from);
      }
    }
    const unusedInputs = Object.keys(tool.inputSchema.shape).filter(
      (input) => !sources.has(input)
    );
    if (unusedInputs.length > 0) {
      throw new TypeError(
        `Extension MCP tool "${tool.name}" does not map input "${unusedInputs[0]}"`
      );
    }
  }

  return capabilities;
}
