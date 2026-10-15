import {
  type CallToolResult,
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import {
  type AgentOperationId,
  agentOperationContracts,
  agentOperations,
  agentResourceDefinitions,
  type BuiltInPluginMcpOperationTool,
  type BuiltInPluginMcpProcedureTool,
  builtInPluginMcpTools,
  isBuiltInPluginMcpProcedureTool,
  type LunarisContentClient,
  type LunarisControlClient,
  resolvePluginMcpInput,
} from "@repo/agent-contracts";
import type * as z from "zod";

export interface AgentToolsServerOptions {
  name?: string;
  version?: string;
}

type AgentOperationHandler = (
  input: Record<string, unknown>
) => Promise<unknown>;

const handlersByServer = new WeakMap<
  McpServer,
  Map<AgentOperationId, AgentOperationHandler>
>();

export function createAgentToolsServer(
  client: LunarisControlClient,
  options: AgentToolsServerOptions = {},
) {
  const server = new McpServer({
    name: options.name ?? "lunaris",
    version: options.version ?? "0.1.0",
  });
  registerAgentTools(server, client);
  registerAgentResources(server, client);
  return server;
}

export function registerAgentTools(
  server: McpServer,
  client: LunarisControlClient,
) {
  tool(
    server,
    "list_organizations",
    agentOperationContracts.list_organizations.input,
    (input) => client.listOrganizations(input),
  );
  tool(
    server,
    "get_organization",
    agentOperationContracts.get_organization.input,
    (input) => client.getOrganization(input.organizationId),
  );
  tool(
    server,
    "list_organization_members",
    agentOperationContracts.list_organization_members.input,
    ({ organizationId, ...input }) => client.listOrganizationMembers(organizationId, input),
  );
  registerContentTools(server, client);
  tool(
    server,
    "get_yjs_storage_state",
    agentOperationContracts.get_yjs_storage_state.input,
    (input) =>
      client.getYjsStorageState(
        input.organizationId,
        input.workspaceId,
        input.storageId,
        input.stateVectorB64,
      ),
  );
  tool(
    server,
    "list_key_value_storage",
    agentOperationContracts.list_key_value_storage.input,
    (input) =>
      client.listKeyValueStorage(
        input.organizationId,
        input.workspaceId,
        input.storageId,
      ),
  );
  tool(
    server,
    "get_file_download_url",
    agentOperationContracts.get_file_download_url.input,
    (input) =>
      client.getFileDownloadUrl(
        input.organizationId,
        input.workspaceId,
        input.storageId,
      ),
  );

  tool(
    server,
    "update_organization",
    agentOperationContracts.update_organization.input,
    ({ idempotencyKey, organizationId, ...input }) =>
      client.updateOrganization(organizationId, input, { idempotencyKey }),
  );
  tool(
    server,
    "create_workspace",
    agentOperationContracts.create_workspace.input,
    ({ idempotencyKey, organizationId, ...input }) =>
      client.createWorkspace(organizationId, input, { idempotencyKey }),
  );
  tool(
    server,
    "update_workspace",
    agentOperationContracts.update_workspace.input,
    ({ idempotencyKey, workspaceId, organizationId, ...input }) =>
      client.updateWorkspace(organizationId, workspaceId, input, { idempotencyKey }),
  );
  tool(
    server,
    "create_resource",
    agentOperationContracts.create_resource.input,
    ({
      expectedParentResourceTypeId,
      idempotencyKey,
      workspaceId,
      organizationId,
      ...input
    }) =>
      client.createWorkspaceResource(organizationId, workspaceId, input, {
        ...(expectedParentResourceTypeId === undefined
          ? {}
          : { expectedParentResourceTypeId }),
        idempotencyKey,
      }),
  );
  tool(
    server,
    "update_resource",
    agentOperationContracts.update_resource.input,
    ({ idempotencyKey, resourceId, workspaceId, organizationId, ...input }) =>
      client.updateWorkspaceResource(organizationId, workspaceId, resourceId, input, {
        idempotencyKey,
      }),
  );
  tool(
    server,
    "invite_organization_member",
    agentOperationContracts.invite_organization_member.input,
    ({ idempotencyKey, organizationId, ...input }) =>
      client.inviteOrganizationMember(organizationId, input, { idempotencyKey }),
  );

  tool(
    server,
    "preview_delete_workspace",
    agentOperationContracts.preview_delete_workspace.input,
    (input) => client.previewDeleteWorkspace(input.organizationId, input.workspaceId),
  );
  tool(
    server,
    "delete_workspace",
    agentOperationContracts.delete_workspace.input,
    (input) =>
      client.deleteWorkspace(
        input.organizationId,
        input.workspaceId,
        input.previewToken,
        { idempotencyKey: input.idempotencyKey },
      ),
  );
  tool(
    server,
    "preview_delete_resource",
    agentOperationContracts.preview_delete_resource.input,
    (input) =>
      client.previewDeleteWorkspaceResource(
        input.organizationId,
        input.workspaceId,
        input.resourceId,
        input.expectedResourceTypeId
          ? { expectedResourceTypeId: input.expectedResourceTypeId }
          : undefined,
      ),
  );
  tool(
    server,
    "delete_resource",
    agentOperationContracts.delete_resource.input,
    (input) =>
      client.deleteWorkspaceResource(
        input.organizationId,
        input.workspaceId,
        input.resourceId,
        input.previewToken,
        {
          ...(input.expectedResourceTypeId
            ? { expectedResourceTypeId: input.expectedResourceTypeId }
            : {}),
          idempotencyKey: input.idempotencyKey,
        },
      ),
  );
  tool(
    server,
    "preview_remove_organization_member",
    agentOperationContracts.preview_remove_organization_member.input,
    (input) =>
      client.previewRemoveOrganizationMember(input.organizationId, input.memberId),
  );
  tool(
    server,
    "remove_organization_member",
    agentOperationContracts.remove_organization_member.input,
    (input) =>
      client.removeOrganizationMember(
        input.organizationId,
        input.memberId,
        input.previewToken,
        { idempotencyKey: input.idempotencyKey },
      ),
  );
  registerBuiltInPluginTools(server, client);
}

function registerContentTools(
  server: McpServer,
  client: LunarisContentClient,
) {
  tool(
    server,
    "list_workspaces",
    agentOperationContracts.list_workspaces.input,
    ({ organizationId, ...input }) => client.listWorkspaces(organizationId, input),
  );
  tool(
    server,
    "get_workspace",
    agentOperationContracts.get_workspace.input,
    (input) => client.getWorkspace(input.organizationId, input.workspaceId),
  );
  tool(
    server,
    "list_resources",
    agentOperationContracts.list_resources.input,
    ({ workspaceId, organizationId, ...input }) =>
      client.listWorkspaceResources(organizationId, workspaceId, input),
  );
  tool(
    server,
    "search_resources",
    agentOperationContracts.search_resources.input,
    ({ organizationId, ...input }) => client.searchResources(organizationId, input),
  );
  tool(
    server,
    "get_resource",
    agentOperationContracts.get_resource.input,
    (input) =>
      client.getWorkspaceResource(input.organizationId, input.workspaceId, input.resourceId),
  );
  tool(
    server,
    "get_yjs_storage_json",
    agentOperationContracts.get_yjs_storage_json.input,
    (input) =>
      client.getYjsStorageJson(
        input.organizationId,
        input.workspaceId,
        input.storageId,
      ),
  );
}

export function registerAgentResources(
  server: McpServer,
  client: LunarisControlClient,
) {
  for (const definition of agentResourceDefinitions) {
    resource(
      server,
      definition.name,
      definition.uriTemplate,
      (variables) => readAgentResource(client, definition.operation, variables),
    );
  }
}

function readAgentResource(
  client: LunarisControlClient,
  operation: AgentOperationId,
  variables: Record<string, string>,
) {
  const organizationId = requiredVariable(variables.organizationId);
  switch (operation) {
    case "get_organization":
      return client.getOrganization(organizationId);
    case "list_organization_members":
      return client.listOrganizationMembers(organizationId);
    case "get_workspace":
      return client.getWorkspace(
        organizationId,
        requiredVariable(variables.workspaceId),
      );
    case "list_resources":
      return client.listWorkspaceResources(
        organizationId,
        requiredVariable(variables.workspaceId),
      );
    case "get_yjs_storage_json":
      return client.getYjsStorageJson(
        organizationId,
        requiredVariable(variables.workspaceId),
        requiredVariable(variables.storageId),
      );
    default:
      throw new Error(`Unsupported agent resource operation: ${operation}`);
  }
}

function tool<Schema extends z.ZodObject>(
  server: McpServer,
  name: AgentOperationId,
  inputSchema: Schema,
  handler: (input: z.output<Schema>) => Promise<unknown>,
) {
  const handlers =
    handlersByServer.get(server) ??
    new Map<AgentOperationId, AgentOperationHandler>();
  handlers.set(name, (input) => handler(input as z.output<Schema>));
  handlersByServer.set(server, handlers);

  const callback = (input: unknown) =>
    callTool(async () =>
      agentOperationContracts[name].output.parse(
        await handler(input as z.output<Schema>),
      ),
    );
  server.registerTool(
    name,
    {
      _meta: {
        "app.lunaris/offlineAvailability":
          agentOperations[name].offlineAvailability,
      },
      annotations: operationAnnotations(name),
      description: agentOperations[name].description,
      inputSchema,
      outputSchema: agentOperationContracts[name].output,
    },
    callback as never,
  );
}

function registerBuiltInPluginTools(
  server: McpServer,
  client: LunarisControlClient,
) {
  for (const definition of builtInPluginMcpTools) {
    if (isBuiltInPluginMcpProcedureTool(definition)) {
      registerBuiltInPluginProcedure(server, client, definition);
      continue;
    }
    registerBuiltInPluginOperation(server, definition);
  }
}

function registerBuiltInPluginProcedure(
  server: McpServer,
  client: LunarisControlClient,
  definition: BuiltInPluginMcpProcedureTool,
) {
  server.registerTool(
    definition.name,
    {
      _meta: {
        "app.lunaris/offlineAvailability":
          definition.execution.offlineAvailability,
        "app.lunaris/pluginId": definition.pluginId,
      },
      annotations: {
        destructiveHint: definition.execution.risk === "destructive",
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: definition.execution.risk === "read",
      },
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
    },
    (input) =>
      callTool(async () => {
        const parsed = definition.inputSchema.parse(input);
        const {
          idempotencyKey,
          workspaceId,
          organizationId,
          ...operationInput
        } = parsed;
        const parsedIdempotencyKey =
          idempotencyKey === undefined
            ? undefined
            : requiredInputString(idempotencyKey, "idempotencyKey");
        return definition.outputSchema.parse(
          await client.executePluginOperation(
            requiredInputString(organizationId, "organizationId"),
            requiredInputString(workspaceId, "workspaceId"),
            definition.pluginId,
            definition.execution.operation,
            operationInput,
            { idempotencyKey: parsedIdempotencyKey },
          ),
        );
      }),
  );
}

function registerBuiltInPluginOperation(
  server: McpServer,
  definition: BuiltInPluginMcpOperationTool,
) {
  const operationId = definition.execution.operation;
  const operation = agentOperations[operationId];
  const handler = handlersByServer.get(server)?.get(operationId);
  if (!handler) {
    throw new Error(
      `Extension MCP tool "${definition.name}" has no API handler for "${operationId}"`,
    );
  }
  server.registerTool(
    definition.name,
    {
      _meta: {
        "app.lunaris/offlineAvailability": operation.offlineAvailability,
        "app.lunaris/pluginId": definition.pluginId,
      },
      annotations: operationAnnotations(operationId),
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: agentOperationContracts[operationId].output,
    },
    (input) =>
      callTool(async () => {
        const operationInput = resolvePluginMcpInput(
          definition,
          input as Record<string, unknown>,
        );
        const contract = agentOperationContracts[operationId];
        const parsedInput = contract.input.parse(operationInput);
        return contract.output.parse(await handler(parsedInput));
      }),
  );
}

async function callTool(
  run: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return result(await run());
  } catch (error) {
    return failure(error);
  }
}

function operationAnnotations(name: AgentOperationId) {
  const { risk } = agentOperations[name];
  return {
    destructiveHint: risk === "destructive",
    idempotentHint: !name.startsWith("preview_"),
    openWorldHint: false,
    readOnlyHint: risk === "read",
  };
}

function resource(
  server: McpServer,
  name: string,
  template: string,
  handler: (variables: Record<string, string>) => Promise<unknown>,
) {
  server.registerResource(
    name,
    new ResourceTemplate(template, { list: undefined }),
    { description: name.replaceAll("-", " "), mimeType: "application/json" },
    async (uri, variables) => {
      const value = await handler(
        Object.fromEntries(
          Object.entries(variables).map(([key, item]) => [key, String(item)]),
        ),
      );
      return {
        contents: [{ mimeType: "application/json", text: JSON.stringify(value), uri: uri.href }],
      };
    },
  );
}

function result(value: unknown): CallToolResult {
  const structuredContent = asObject(value);
  return {
    content: [{ text: summary(value), type: "text" as const }],
    structuredContent,
  };
}

function failure(error: unknown): CallToolResult {
  const status = errorStatus(error);
  const response = errorResponse(error);
  const code =
    stringField(error, "code") ??
    stringField(response, "code") ??
    (status ? `HTTP_${status}` : "INTERNAL_ERROR");
  const details =
    field(error, "details") ?? field(response, "details");
  const responseMessage = field(response, "message");
  const message =
    typeof responseMessage === "string"
      ? responseMessage
      : Array.isArray(responseMessage)
        ? responseMessage.join("; ")
        : status && status < 500 && error instanceof Error
          ? error.message
          : "Internal server error";
  const body = {
    code,
    ...(details === undefined ? {} : { details }),
    message,
    ...(status ? { status } : {}),
  };
  return {
    content: [{ text: `${body.code}: ${body.message}`, type: "text" as const }],
    isError: true as const,
    structuredContent: asObject(body),
  };
}

function errorResponse(error: unknown) {
  if (typeof error !== "object" || error === null) return;
  const getResponse = (error as { getResponse?: unknown }).getResponse;
  return typeof getResponse === "function"
    ? getResponse.call(error)
    : undefined;
}

function field(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return;
  return (value as Record<string, unknown>)[key];
}

function stringField(value: unknown, key: string) {
  const valueAtKey = field(value, key);
  return typeof valueAtKey === "string" ? valueAtKey : undefined;
}

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    getStatus?: () => unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status =
    typeof candidate.getStatus === "function"
      ? candidate.getStatus()
      : candidate.status ?? candidate.statusCode;
  return typeof status === "number" ? status : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function requiredVariable(value: string | undefined) {
  if (!value) throw new Error("Resource URI variable is missing");
  return value;
}

function requiredInputString(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function summary(value: unknown) {
  if (typeof value !== "object" || value === null) return String(value);
  if ("items" in value && Array.isArray(value.items)) {
    return `${value.items.length} result${value.items.length === 1 ? "" : "s"}`;
  }
  const record = value as Record<string, unknown>;
  return [record.name, record.id, record.storageId].filter(Boolean).join(" · ") || "OK";
}
