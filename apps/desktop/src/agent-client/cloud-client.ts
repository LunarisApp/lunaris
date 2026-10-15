import {
  type AgentOperationId,
  agentOperationContracts,
  findBuiltInPluginMcpProcedure,
  type LunarisControlClient,
  pluginMcpWire,
  type ReadConsistency,
  type RequestOptions,
  type SerializedAgentOperation,
  serializeAgentOperation,
  serializeAgentWire,
} from "@repo/agent-contracts";
import type * as z from "zod";

export interface CloudClientOptions {
  accessToken?: string | (() => Promise<string>);
  apiKey?: string;
  baseUrl: string;
  consistency?: ReadConsistency;
  fetch?: Fetcher;
  timeoutMs?: number;
}

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class LunarisApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    code = "API_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "LunarisApiError";
    this.status = status;
  }
}

export class CloudLunarisControlClient implements LunarisControlClient {
  private readonly fetcher: Fetcher;
  private readonly baseUrl: string;
  private readonly options: CloudClientOptions;
  private readonly timeoutMs: number;

  constructor(options: CloudClientOptions) {
    if (options.apiKey && options.accessToken) {
      throw new TypeError("Configure either apiKey or accessToken, not both");
    }
    this.baseUrl = controlBaseUrl(options.baseUrl);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  listOrganizations: LunarisControlClient["listOrganizations"] = (
    input = {},
    options?: RequestOptions,
  ) =>
    this.operation("list_organizations", { ...input }, options);

  getOrganization: LunarisControlClient["getOrganization"] = (
    organizationId: string,
    options?: RequestOptions,
  ) =>
    this.operation("get_organization", { organizationId }, options);

  listOrganizationMembers: LunarisControlClient["listOrganizationMembers"] = (
    organizationId: string,
    input = {},
    options?: RequestOptions,
  ) =>
    this.operation(
      "list_organization_members",
      { ...input, organizationId },
      options,
    );

  updateOrganization: LunarisControlClient["updateOrganization"] = (
    organizationId,
    input,
    options,
  ) => {
    return this.operation(
      "update_organization",
      { ...input, idempotencyKey: options?.idempotencyKey, organizationId },
      options,
    );
  };

  inviteOrganizationMember: LunarisControlClient["inviteOrganizationMember"] = (
    organizationId,
    input,
    options,
  ) =>
    this.operation(
      "invite_organization_member",
      { ...input, idempotencyKey: options?.idempotencyKey, organizationId },
      options,
    );

  previewRemoveOrganizationMember: LunarisControlClient["previewRemoveOrganizationMember"] = (
    organizationId,
    memberId,
    options,
  ) =>
    this.operation(
      "preview_remove_organization_member",
      { memberId, organizationId },
      options,
    );

  removeOrganizationMember: LunarisControlClient["removeOrganizationMember"] = (
    organizationId,
    memberId,
    previewToken,
    options,
  ) =>
    this.operation(
      "remove_organization_member",
      {
        idempotencyKey: options?.idempotencyKey,
        memberId,
        previewToken,
        organizationId,
      },
      options,
    );

  listWorkspaces: LunarisControlClient["listWorkspaces"] = (
    organizationId: string,
    input = {},
    options?: RequestOptions,
  ) =>
    this.operation("list_workspaces", { ...input, organizationId }, options);

  getWorkspace: LunarisControlClient["getWorkspace"] = (
    organizationId: string,
    workspaceId: string,
    options?: RequestOptions,
  ) =>
    this.operation("get_workspace", { workspaceId, organizationId }, options);

  createWorkspace: LunarisControlClient["createWorkspace"] = (
    organizationId: string,
    input: Parameters<LunarisControlClient["createWorkspace"]>[1],
    options?: RequestOptions,
  ) =>
    this.operation(
      "create_workspace",
      { ...input, idempotencyKey: options?.idempotencyKey, organizationId },
      options,
    );

  updateWorkspace: LunarisControlClient["updateWorkspace"] = (
    organizationId: string,
    workspaceId: string,
    input: Parameters<LunarisControlClient["updateWorkspace"]>[2],
    options?: RequestOptions,
  ) => {
    return this.operation(
      "update_workspace",
      {
        ...input,
        idempotencyKey: options?.idempotencyKey,
        workspaceId,
        organizationId,
      },
      options,
    );
  };

  listWorkspaceResources: LunarisControlClient["listWorkspaceResources"] = (
    organizationId: string,
    workspaceId: string,
    input = {},
    options?: RequestOptions,
  ) =>
    this.operation(
      "list_resources",
      { ...input, workspaceId, organizationId },
      options,
    );

  searchResources: LunarisControlClient["searchResources"] = (
    organizationId: string,
    input,
    options?: RequestOptions,
  ) =>
    this.operation("search_resources", { ...input, organizationId }, options);

  getWorkspaceResource: LunarisControlClient["getWorkspaceResource"] = (
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "get_resource",
      { resourceId, workspaceId, organizationId },
      options,
    );

  createWorkspaceResource: LunarisControlClient["createWorkspaceResource"] = (
    organizationId: string,
    workspaceId: string,
    input: Parameters<LunarisControlClient["createWorkspaceResource"]>[2],
    options?: Parameters<LunarisControlClient["createWorkspaceResource"]>[3],
  ) =>
    this.operation(
      "create_resource",
      {
        ...input,
        expectedParentResourceTypeId: options?.expectedParentResourceTypeId,
        idempotencyKey: options?.idempotencyKey,
        workspaceId,
        organizationId,
      },
      options,
    );

  updateWorkspaceResource: LunarisControlClient["updateWorkspaceResource"] = (
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    input: Parameters<LunarisControlClient["updateWorkspaceResource"]>[3],
    options?: RequestOptions,
  ) => {
    return this.operation(
      "update_resource",
      {
        ...input,
        idempotencyKey: options?.idempotencyKey,
        resourceId,
        workspaceId,
        organizationId,
      },
      options,
    );
  };

  getYjsStorageJson: LunarisControlClient["getYjsStorageJson"] = (
    organizationId: string,
    workspaceId: string,
    storageId: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "get_yjs_storage_json",
      { workspaceId, storageId, organizationId },
      options,
    );

  getYjsStorageState: LunarisControlClient["getYjsStorageState"] = (
    organizationId: string,
    workspaceId: string,
    storageId: string,
    stateVectorB64?: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "get_yjs_storage_state",
      { workspaceId, stateVectorB64, storageId, organizationId },
      options,
    );

  listKeyValueStorage: LunarisControlClient["listKeyValueStorage"] = (
    organizationId: string,
    workspaceId: string,
    storageId: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "list_key_value_storage",
      { workspaceId, storageId, organizationId },
      options,
    );

  getFileDownloadUrl: LunarisControlClient["getFileDownloadUrl"] = (
    organizationId: string,
    workspaceId: string,
    storageId: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "get_file_download_url",
      { workspaceId, storageId, organizationId },
      options,
    );

  previewDeleteWorkspace: LunarisControlClient["previewDeleteWorkspace"] = (
    organizationId: string,
    workspaceId: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "preview_delete_workspace",
      { workspaceId, organizationId },
      options,
    );

  previewDeleteWorkspaceResource: LunarisControlClient["previewDeleteWorkspaceResource"] = (
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    options?: Parameters<
      LunarisControlClient["previewDeleteWorkspaceResource"]
    >[3],
  ) =>
    this.operation(
      "preview_delete_resource",
      {
        expectedResourceTypeId: options?.expectedResourceTypeId,
        resourceId,
        workspaceId,
        organizationId,
      },
      options,
    );

  deleteWorkspace: LunarisControlClient["deleteWorkspace"] = (
    organizationId: string,
    workspaceId: string,
    previewToken: string,
    options?: RequestOptions,
  ) =>
    this.operation(
      "delete_workspace",
      {
        idempotencyKey: options?.idempotencyKey,
        previewToken,
        workspaceId,
        organizationId,
      },
      options,
    );

  deleteWorkspaceResource: LunarisControlClient["deleteWorkspaceResource"] = (
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    previewToken: string,
    options?: Parameters<LunarisControlClient["deleteWorkspaceResource"]>[4],
  ) =>
    this.operation(
      "delete_resource",
      {
        idempotencyKey: options?.idempotencyKey,
        expectedResourceTypeId: options?.expectedResourceTypeId,
        resourceId,
        previewToken,
        workspaceId,
        organizationId,
      },
      options,
    );

  executePluginOperation: LunarisControlClient["executePluginOperation"] = (
    organizationId,
    workspaceId,
    pluginId,
    operation,
    input,
    options,
  ) => {
    const definition = findBuiltInPluginMcpProcedure(pluginId, operation);
    if (!definition) {
      return Promise.reject(
        new TypeError(`Unknown built-in extension operation: ${pluginId}:${operation}`),
      );
    }
    return this.request(
      `${pluginId}:${operation}`,
      serializeAgentWire(pluginMcpWire(definition), {
        ...input,
        idempotencyKey: options?.idempotencyKey,
        pluginId,
        workspaceId,
        organizationId,
      }),
      definition.outputSchema,
      options,
    );
  };

  private operation<T>(
    operation: AgentOperationId,
    input: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request(
      operation,
      serializeAgentOperation(operation, input),
      agentOperationContracts[operation].output,
      options,
    );
  }

  private async request<T>(
    operation: string,
    wire: SerializedAgentOperation,
    outputSchema: z.ZodType,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${wire.path}`);
    for (const [key, value] of Object.entries(wire.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const accessToken =
      typeof this.options.accessToken === "function"
        ? await this.options.accessToken()
        : this.options.accessToken;
    const response = await this.fetcher(url, {
      body: wire.body === undefined ? undefined : JSON.stringify(wire.body),
      headers: {
        Accept: "application/json",
        ...(wire.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(this.options.apiKey
          ? { "X-Lunaris-API-Key": this.options.apiKey }
          : {}),
        ...(accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}),
        ...((options.consistency ?? this.options.consistency)
          ? {
              "X-Lunaris-Consistency":
                options.consistency ?? this.options.consistency,
            }
          : {}),
        ...wire.headers,
      },
      method: wire.method,
      signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = payload as
        | { code?: string; details?: unknown; message?: string }
        | undefined;
      throw new LunarisApiError(
        error?.message ?? `Lunaris API returned ${response.status}`,
        response.status,
        error?.code,
        error?.details,
      );
    }
    const parsed = outputSchema.safeParse(payload);
    if (!parsed.success) {
      throw new LunarisApiError(
        `Lunaris API returned an invalid ${operation} response`,
        502,
        "INVALID_API_RESPONSE",
        parsed.error.issues,
      );
    }
    return parsed.data as T;
  }
}

function controlBaseUrl(value: string) {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TypeError("Lunaris API URLs must use HTTPS, except on localhost");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError("Lunaris API URL contains unsupported components");
  }
  return url.toString().replace(/\/$/, "");
}
