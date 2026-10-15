import {
  type ContentRequestOptions,
  createWorkspaceInputSchema,
  createWorkspaceResourceInputSchema,
  inviteOrganizationMemberInputSchema,
  type LunarisControlClient,
  paginationInputSchema,
  workspaceResourceFiltersSchema,
  workspaceResourceSearchInputSchema,
  updateWorkspaceInputSchema,
  updateWorkspaceResourceInputSchema,
  updateOrganizationInputSchema,
} from "@repo/agent-contracts";
import { serializeErrorForLog } from "@repo/utils/log-error";
import { log } from "evlog";

export interface LocalContentRequest {
  body?: unknown;
  headers?: Record<string, string>;
  id: string;
  method: string;
  path: string;
  query: string;
}

export interface LocalContentResponse {
  body: unknown;
  status: number;
}

interface WorkspaceRouteContext {
  client: LunarisControlClient;
  method: string;
  organizationId: string;
  query: Record<string, string>;
  read: ContentRequestOptions;
  request: LocalContentRequest;
  segments: string[];
  workspaceId: string;
}

export async function routeLocalContentRequest(
  client: LunarisControlClient,
  request: LocalContentRequest,
): Promise<LocalContentResponse> {
  try {
    const segments = request.path
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    const query = Object.fromEntries(new URLSearchParams(request.query));
    const read = readOptions(request);
    if (segments[0] !== "v1" || segments[1] !== "organizations") {
      return failure(404, "NOT_FOUND", "Agent endpoint not found");
    }
    const method = request.method;
    if (segments.length === 2 && method === "GET") {
      return success(
        await client.listOrganizations(
          parseQuery(paginationInputSchema, query),
          read,
        ),
      );
    }
    const organizationId = required(segments[2], "organization ID");
    if (segments.length === 3) {
      if (method === "GET") {
        return success(await client.getOrganization(organizationId, read));
      }
      if (method === "PATCH") {
        return success(
          await client.updateOrganization(
            organizationId,
            parseBody(updateOrganizationInputSchema, {
              ...objectBody(request.body),
              expectedRevision: revision(request),
            }),
            writeOptions(request),
          ),
        );
      }
    }
    if (segments[3] === "members") {
      if (segments.length === 4 && method === "GET") {
        return success(
          await client.listOrganizationMembers(
            organizationId,
            parseQuery(paginationInputSchema, query),
            read,
          ),
        );
      }
      if (
        segments.length === 5 &&
        segments[4] === "invitations" &&
        method === "POST"
      ) {
        return success(
          await client.inviteOrganizationMember(
            organizationId,
            parseBody(inviteOrganizationMemberInputSchema, request.body),
            writeOptions(request),
          ),
        );
      }
      const memberId = required(segments[4], "member ID");
      if (
        segments.length === 6 &&
        segments[5] === "removal-preview" &&
        method === "POST"
      ) {
        return success(
          await client.previewRemoveOrganizationMember(
            organizationId,
            memberId,
            read,
          ),
        );
      }
      if (segments.length === 5 && method === "DELETE") {
        return success(
          await client.removeOrganizationMember(
            organizationId,
            memberId,
            previewToken(request),
            writeOptions(request),
          ),
        );
      }
      return failure(404, "NOT_FOUND", "Agent endpoint not found");
    }
    if (segments.length === 4 && segments[3] === "workspaces") {
      if (method === "GET") {
        return success(
          await client.listWorkspaces(
            organizationId,
            parseQuery(paginationInputSchema, query),
            read,
          ),
        );
      }
      if (method === "POST") {
        return success(
          await client.createWorkspace(
            organizationId,
            parseBody(createWorkspaceInputSchema, request.body),
            writeOptions(request),
          ),
        );
      }
    }
    if (segments.length === 4 && segments[3] === "items" && method === "GET") {
      return success(
        await client.searchResources(
          organizationId,
          parseQuery(workspaceResourceSearchInputSchema, query),
          read,
        ),
      );
    }
    if (segments[3] !== "workspaces") {
      return failure(404, "NOT_FOUND", "Agent endpoint not found");
    }
    const workspaceId = required(segments[4], "workspace ID");
    if (segments.length === 5) {
      if (method === "GET") {
        return success(await client.getWorkspace(organizationId, workspaceId, read));
      }
      if (method === "PATCH") {
        return success(
          await client.updateWorkspace(
            organizationId,
            workspaceId,
            parseBody(updateWorkspaceInputSchema, {
              ...objectBody(request.body),
              expectedRevision: revision(request),
            }),
            writeOptions(request),
          ),
        );
      }
      if (method === "DELETE") {
        return success(
          await client.deleteWorkspace(
            organizationId,
            workspaceId,
            previewToken(request),
            writeOptions(request),
          ),
        );
      }
    }
    if (
      segments.length === 6 &&
      segments[5] === "deletion-preview" &&
      method === "POST"
    ) {
      return success(
        await client.previewDeleteWorkspace(organizationId, workspaceId, read),
      );
    }
    const context = {
      client,
      method,
      workspaceId,
      query,
      read,
      request,
      segments,
      organizationId,
    };
    const nestedResponse =
      (await routeWorkspaceResources(context)) ??
      (await routeWorkspacePlugin(context)) ??
      (await routeStorage(context));
    if (nestedResponse) return nestedResponse;
    return failure(404, "NOT_FOUND", "Agent endpoint not found");
  } catch (error) {
    if (error instanceof URIError) {
      return failure(400, "INVALID_REQUEST", "Request path is invalid");
    }
    const candidate = error as {
      code?: string;
      details?: unknown;
      exposeToAgent?: boolean;
      message?: string;
      status?: number;
    };
    if (
      candidate.exposeToAgent === true &&
      typeof candidate.code === "string" &&
      typeof candidate.message === "string" &&
      typeof candidate.status === "number"
    ) {
      return failure(
        candidate.status,
        candidate.code,
        candidate.message,
        candidate.details,
      );
    }
    log.error({
      action: "desktop.agent.request.route",
      agent: {
        method: request.method,
        requestId: request.id,
      },
      error: serializeErrorForLog(error),
      outcome: "failure",
    });
    return failure(
      500,
      "INTERNAL_ERROR",
      "Desktop agent request failed",
    );
  }
}

async function routeWorkspacePlugin({
  client,
  method,
  workspaceId,
  query,
  read,
  request,
  segments,
  organizationId,
}: WorkspaceRouteContext): Promise<LocalContentResponse | undefined> {
  if (
    segments[5] !== "plugins" ||
    segments[7] !== "operations" ||
    segments.length !== 9
  ) {
    return undefined;
  }
  if (method === "GET") {
    return success(
      await client.executePluginOperation(
        organizationId,
        workspaceId,
        required(segments[6], "extension ID"),
        required(segments[8], "extension operation"),
        query,
        read,
      ),
    );
  }
  if (method !== "POST") return undefined;
  const expectedRevision = optionalRevision(request);
  return success(
    await client.executePluginOperation(
      organizationId,
      workspaceId,
      required(segments[6], "extension ID"),
      required(segments[8], "extension operation"),
      {
        ...objectBody(request.body),
        ...(expectedRevision ? { expectedRevision } : {}),
      },
      writeOptions(request),
    ),
  );
}

async function routeWorkspaceResources({
  client,
  method,
  workspaceId,
  query,
  read,
  request,
  segments,
  organizationId,
}: WorkspaceRouteContext): Promise<LocalContentResponse | undefined> {
  if (segments[5] !== "resources") return undefined;
  if (segments.length === 6) {
    if (method === "GET") {
      return success(
        await client.listWorkspaceResources(
          organizationId,
          workspaceId,
          parseQuery(workspaceResourceFiltersSchema, query),
          read,
        ),
      );
    }
    if (method === "POST") {
      return success(
        await client.createWorkspaceResource(
          organizationId,
          workspaceId,
          parseBody(createWorkspaceResourceInputSchema, request.body),
          {
            ...writeOptions(request),
            expectedParentResourceTypeId: query.expectedParentResourceTypeId,
          },
        ),
      );
    }
  }
  const resourceId = required(segments[6], "resource ID");
  if (segments.length === 7) {
    if (method === "GET") {
      return success(
        await client.getWorkspaceResource(organizationId, workspaceId, resourceId, read),
      );
    }
    if (method === "PATCH") {
      return success(
        await client.updateWorkspaceResource(
          organizationId,
          workspaceId,
          resourceId,
          parseBody(updateWorkspaceResourceInputSchema, {
            ...objectBody(request.body),
            expectedRevision: revision(request),
          }),
          writeOptions(request),
        ),
      );
    }
    if (method === "DELETE") {
      return success(
        await client.deleteWorkspaceResource(
          organizationId,
          workspaceId,
          resourceId,
          previewToken(request),
          {
            ...writeOptions(request),
            ...(query.expectedResourceTypeId
              ? { expectedResourceTypeId: query.expectedResourceTypeId }
              : {}),
          },
        ),
      );
    }
  }
  if (
    segments.length === 8 &&
    segments[7] === "deletion-preview" &&
    method === "POST"
  ) {
    return success(
      await client.previewDeleteWorkspaceResource(
        organizationId,
        workspaceId,
        resourceId,
        {
          ...read,
          ...(query.expectedResourceTypeId
            ? { expectedResourceTypeId: query.expectedResourceTypeId }
            : {}),
        },
      ),
    );
  }
  return undefined;
}

async function routeStorage({
  client,
  method,
  workspaceId,
  query,
  read,
  segments,
  organizationId,
}: WorkspaceRouteContext): Promise<LocalContentResponse | undefined> {
  if (segments[5] !== "storage" || method !== "GET") return undefined;
  const storageId = required(segments[6], "storage ID");
  if (segments.length === 9 && segments[7] === "yjs" && segments[8] === "json") {
    return success(
      await client.getYjsStorageJson(
        organizationId,
        workspaceId,
        storageId,
        read,
      ),
    );
  }
  if (segments.length === 9 && segments[7] === "yjs" && segments[8] === "state") {
    return success(
      await client.getYjsStorageState(
        organizationId,
        workspaceId,
        storageId,
        query.stateVectorB64,
        read,
      ),
    );
  }
  if (segments.length === 8 && segments[7] === "values") {
    return success(
      await client.listKeyValueStorage(
        organizationId,
        workspaceId,
        storageId,
        read,
      ),
    );
  }
  if (segments.length === 9 && segments[7] === "file" && segments[8] === "download-url") {
    return success(
      await client.getFileDownloadUrl(
        organizationId,
        workspaceId,
        storageId,
        read,
      ),
    );
  }
  return undefined;
}

function parseQuery<Output>(
  schema: { parse: (value: unknown) => Output },
  query: Record<string, string>,
): Output {
  return parseBody(schema, {
    ...query,
    limit: integer(query.limit),
  });
}

function parseBody<Output>(
  schema: { parse: (value: unknown) => Output },
  body: unknown,
): Output {
  try {
    return schema.parse(body);
  } catch {
    throw requestError("Request input is invalid");
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw requestError("Request body must be an object");
  }
  return body as Record<string, unknown>;
}

function writeOptions(request: LocalContentRequest) {
  return {
    idempotencyKey: required(
      request.headers?.["idempotency-key"],
      "Idempotency-Key",
    ),
  };
}

function readOptions(request: LocalContentRequest): ContentRequestOptions {
  const value = request.headers?.["x-lunaris-consistency"];
  if (value !== undefined && value !== "confirmed" && value !== "cached") {
    throw requestError("X-Lunaris-Consistency is invalid");
  }
  return {
    ...(value ? { consistency: value } : {}),
    signal: AbortSignal.timeout(29_000),
  };
}

function revision(request: LocalContentRequest) {
  const value = required(request.headers?.["if-match"], "If-Match");
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function optionalRevision(request: LocalContentRequest) {
  const value = request.headers?.["if-match"];
  if (!value) return undefined;
  return value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

function previewToken(request: LocalContentRequest) {
  return required(request.headers?.["x-lunaris-preview"], "X-Lunaris-Preview");
}

function integer(value?: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
}

function required(value: string | undefined, name: string) {
  if (!value) throw requestError(`${name} is required`);
  return value;
}

function requestError(message: string) {
  return Object.assign(new Error(message), {
    code: "INVALID_REQUEST",
    exposeToAgent: true,
    status: 400,
  });
}

function success(body: unknown): LocalContentResponse {
  return { body, status: 200 };
}

function failure(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): LocalContentResponse {
  return {
    body: {
      code,
      ...(details === undefined ? {} : { details }),
      message,
    },
    status,
  };
}
