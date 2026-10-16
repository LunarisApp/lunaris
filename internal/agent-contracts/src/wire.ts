import type { AgentOperationId } from "./operations";

export type AgentHttpMethod = "DELETE" | "GET" | "PATCH" | "POST";

export interface AgentWireInputMapping {
  fixed?: Readonly<Record<string, unknown>>;
  renamed?: Readonly<Record<string, string>>;
}

export interface AgentOperationWireDefinition {
  body?: readonly string[];
  headers?: Readonly<Record<string, string>>;
  inputMapping?: AgentWireInputMapping;
  method: AgentHttpMethod;
  path: string;
  query?: readonly string[];
}

const writeHeaders = {
  idempotencyKey: "Idempotency-Key",
} as const;
const revisionHeaders = {
  ...writeHeaders,
  expectedRevision: "If-Match",
} as const;
const destructiveHeaders = {
  ...writeHeaders,
  previewToken: "X-Lunaris-Preview",
} as const;

export const agentOperationWire = {
  create_resource: {
    body: [
      "icon",
      "name",
      "parentId",
      "resourceTypeId",
      "schemaVersion",
      "position",
      "storage",
    ],
    headers: writeHeaders,
    method: "POST",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/resources",
    query: ["expectedParentResourceTypeId"],
  },
  create_workspace: {
    body: ["name", "slug", "visibility"],
    headers: writeHeaders,
    method: "POST",
    path: "/v1/organizations/{organizationId}/workspaces",
  },
  delete_resource: {
    headers: destructiveHeaders,
    method: "DELETE",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/resources/{resourceId}",
    query: ["expectedResourceTypeId"],
  },
  delete_workspace: {
    headers: destructiveHeaders,
    method: "DELETE",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}",
  },
  get_yjs_storage_json: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/storage/{storageId}/yjs/json",
  },
  get_yjs_storage_state: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/storage/{storageId}/yjs/state",
    query: ["stateVectorB64"],
  },
  list_key_value_storage: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/storage/{storageId}/values",
  },
  get_file_download_url: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/storage/{storageId}/file/download-url",
  },
  get_resource: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/resources/{resourceId}",
  },
  get_workspace: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}",
  },
  get_organization: {
    method: "GET",
    path: "/v1/organizations/{organizationId}",
  },
  invite_organization_member: {
    body: ["email", "role"],
    headers: writeHeaders,
    method: "POST",
    path: "/v1/organizations/{organizationId}/members/invitations",
  },
  list_resources: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/resources",
    query: ["cursor", "limit", "name", "parentId", "resourceTypeId"],
  },
  list_workspaces: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/workspaces",
    query: ["cursor", "limit"],
  },
  list_organization_members: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/members",
    query: ["cursor", "limit"],
  },
  list_organizations: {
    method: "GET",
    path: "/v1/organizations",
    query: ["cursor", "limit"],
  },
  preview_delete_resource: {
    method: "POST",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/resources/{resourceId}/deletion-preview",
    query: ["expectedResourceTypeId"],
  },
  preview_delete_workspace: {
    method: "POST",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/deletion-preview",
  },
  preview_remove_organization_member: {
    method: "POST",
    path: "/v1/organizations/{organizationId}/members/{memberId}/removal-preview",
  },
  remove_organization_member: {
    headers: destructiveHeaders,
    method: "DELETE",
    path: "/v1/organizations/{organizationId}/members/{memberId}",
  },
  search_resources: {
    method: "GET",
    path: "/v1/organizations/{organizationId}/resources",
    query: ["cursor", "limit", "workspaceId", "search"],
  },
  update_resource: {
    body: ["icon", "name", "parentId", "position"],
    headers: revisionHeaders,
    method: "PATCH",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}/resources/{resourceId}",
  },
  update_workspace: {
    body: ["name", "slug"],
    headers: revisionHeaders,
    method: "PATCH",
    path: "/v1/organizations/{organizationId}/workspaces/{workspaceId}",
  },
  update_organization: {
    body: ["logo", "name"],
    headers: revisionHeaders,
    method: "PATCH",
    path: "/v1/organizations/{organizationId}",
  },
} as const satisfies Record<AgentOperationId, AgentOperationWireDefinition>;

export interface SerializedAgentOperation {
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  method: AgentHttpMethod;
  path: string;
  query: Record<string, unknown>;
}

export function serializeAgentOperation(
  operation: AgentOperationId,
  input: Record<string, unknown>,
): SerializedAgentOperation {
  const definition = agentOperationWire[operation];
  return serializeAgentWire(definition, input);
}

export function serializeAgentWire(
  definition: AgentOperationWireDefinition,
  rawInput: Record<string, unknown>,
): SerializedAgentOperation {
  const input = applyAgentWireInputMapping(definition, rawInput);
  const path = definition.path.replaceAll(
    /\{([^{}]+)\}/gu,
    (_match, name: string) => encodeURIComponent(requiredString(input[name], name)),
  );
  const query = pick(input, definition.query);
  const body = pick(input, definition.body);
  const headers = Object.fromEntries(
    Object.entries(definition.headers ?? {}).flatMap(([name, rawHeader]) => {
      const header = String(rawHeader);
      const value = input[name];
      if (value === undefined || value === null || value === "") return [];
      return [[header, header === "If-Match" ? quoteEtag(String(value)) : String(value)]];
    }),
  );
  return {
    ...(Object.keys(body).length > 0 ? { body } : {}),
    headers,
    method: definition.method,
    path,
    query,
  };
}

export function applyAgentWireInputMapping(
  definition: AgentOperationWireDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = { ...input };
  for (const [target, source] of Object.entries(
    definition.inputMapping?.renamed ?? {},
  )) {
    if (input[source] !== undefined) resolved[target] = input[source];
  }
  Object.assign(resolved, definition.inputMapping?.fixed);
  return resolved;
}

function pick(
  input: Record<string, unknown>,
  keys?: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    (keys ?? []).flatMap((key) => {
      const value = input[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function quoteEtag(value: string) {
  return value.startsWith('"') ? value : `"${value}"`;
}
