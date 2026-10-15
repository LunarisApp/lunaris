import {
  agentOperationContracts,
  builtInPluginMcpToolOutputSchema,
  builtInPluginMcpToolRisk,
  builtInPluginMcpToolScope,
  findBuiltInPluginMcpTool,
  isBuiltInPluginMcpProcedureTool,
  type LunarisControlClient,
  resolvePluginMcpInput,
} from "@repo/agent-contracts";

export type BuiltInAgentToolPolicy = "mutation" | "read";

interface AgentToolContext {
  organizationId: string;
  workspaceId: string;
}

export function assertAgentToolWorkspaceContext(
  expectedWorkspaceId: string,
  activeWorkspaceId: string
): void {
  if (expectedWorkspaceId !== activeWorkspaceId) {
    throw new Error(
      "The active workspace changed before this tool could run. Ask Luna to try again."
    );
  }
}

export function builtInAgentToolPolicy(
  name: string
): BuiltInAgentToolPolicy | null {
  const definition = findBuiltInPluginMcpTool(name);
  if (!definition) return null;
  return builtInPluginMcpToolRisk(definition) === "read"
    ? "read"
    : "mutation";
}

export function builtInAgentToolScope(name: string) {
  const definition = findBuiltInPluginMcpTool(name);
  return definition ? builtInPluginMcpToolScope(definition) : null;
}

export async function executeBuiltInAgentTool(
  client: LunarisControlClient,
  name: string,
  input: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> {
  const definition = findBuiltInPluginMcpTool(name);
  if (!definition) {
    throw new Error(`Unknown built-in agent tool: ${name}`);
  }
  const parsedInput = definition.inputSchema.parse({
    ...input,
    workspaceId: context.workspaceId,
    organizationId: context.organizationId,
  });

  let output: unknown;
  if (isBuiltInPluginMcpProcedureTool(definition)) {
    const {
      idempotencyKey,
      workspaceId: _workspaceId,
      organizationId: _organizationId,
      ...operationInput
    } = parsedInput;
    output = await client.executePluginOperation(
      context.organizationId,
      context.workspaceId,
      definition.pluginId,
      definition.execution.operation,
      operationInput,
      {
        idempotencyKey:
          typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      }
    );
  } else {
    output = await executeDelegatedTool(
      client,
      definition.execution.operation,
      resolvePluginMcpInput(definition, parsedInput)
    );
  }

  return builtInPluginMcpToolOutputSchema(definition).parse(output);
}

async function executeDelegatedTool(
  client: LunarisControlClient,
  operation: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (operation) {
    case "list_resources": {
      const { workspaceId, organizationId, ...filters } =
        agentOperationContracts.list_resources.input.parse(input);
      return client.listWorkspaceResources(organizationId, workspaceId, filters);
    }
    case "create_resource": {
      const {
        expectedParentResourceTypeId,
        idempotencyKey,
        workspaceId,
        organizationId,
        ...item
      } = agentOperationContracts.create_resource.input.parse(input);
      return client.createWorkspaceResource(organizationId, workspaceId, item, {
        expectedParentResourceTypeId,
        idempotencyKey,
      });
    }
    case "preview_delete_resource": {
      const {
        expectedResourceTypeId,
        resourceId,
        workspaceId,
        organizationId,
      } = agentOperationContracts.preview_delete_resource.input.parse(input);
      return client.previewDeleteWorkspaceResource(
        organizationId,
        workspaceId,
        resourceId,
        { expectedResourceTypeId }
      );
    }
    case "delete_resource": {
      const {
        expectedResourceTypeId,
        idempotencyKey,
        resourceId,
        previewToken,
        workspaceId,
        organizationId,
      } = agentOperationContracts.delete_resource.input.parse(input);
      return client.deleteWorkspaceResource(
        organizationId,
        workspaceId,
        resourceId,
        previewToken,
        { expectedResourceTypeId, idempotencyKey }
      );
    }
    default:
      throw new Error(`Unsupported delegated agent operation: ${operation}`);
  }
}
