import { describe, expect, it } from "vitest";
import { CloudLunarisControlClient } from "./cloud-client";

describe("CloudLunarisControlClient", () => {
  it("rejects credential-bearing requests over insecure remote URLs", () => {
    expect(
      () =>
        new CloudLunarisControlClient({
          apiKey: "secret-key",
          baseUrl: "http://api.lunaris.test",
        })
    ).toThrow("must use HTTPS");
    expect(
      () =>
        new CloudLunarisControlClient({
          apiKey: "secret-key",
          baseUrl: "https://user:pass@api.lunaris.test",
        })
    ).toThrow("unsupported components");
  });

  it("allows plain HTTP for loopback development", () => {
    expect(
      () =>
        new CloudLunarisControlClient({
          apiKey: "secret-key",
          baseUrl: "http://127.0.0.1:3000",
        })
    ).not.toThrow();
  });

  it("addresses organizations explicitly and sends API keys outside URLs", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test/",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ items: [], nextCursor: null });
      },
    });

    await client.listWorkspaces("organization one", { limit: 20 });

    expect(request?.url).toBe(
      "https://api.lunaris.test/v1/organizations/organization%20one/workspaces?limit=20"
    );
    expect(request?.headers.get("X-Lunaris-API-Key")).toBe("secret-key");
    expect(request?.url).not.toContain("secret-key");
  });

  it("forwards the selected Desktop read consistency in a header", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      accessToken: "desktop-token",
      baseUrl: "http://127.0.0.1:3000",
      consistency: "cached",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ items: [], nextCursor: null });
      },
    });

    await client.listWorkspaces("organization");

    expect(request?.headers.get("X-Lunaris-Consistency")).toBe("cached");
  });

  it("keeps OAuth, concurrency, idempotency, and preview credentials in headers", async () => {
    const requests: Request[] = [];
    const client = new CloudLunarisControlClient({
      accessToken: "oauth-token",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/organizations/organization-1")) {
          return Response.json({
            createdAt: "2026-01-01T00:00:00.000Z",
            id: "organization-1",
            logo: null,
            name: "Renamed organization",
            revision: "organization-revision-2",
            slug: "organization",
          });
        }
        if (request.method === "DELETE") {
          return Response.json({ id: "workspace-1" });
        }
        return Response.json({
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "workspace-1",
          name: "Renamed",
          organizationId: "organization-1",
          slug: "workspace",
          updatedAt: "revision-2",
          visibility: "shared",
        });
      },
    });

    await client.updateWorkspace(
      "organization-1",
      "workspace-1",
      { expectedRevision: "revision-1", name: "Renamed" },
      { idempotencyKey: "request-key" }
    );
    await client.updateOrganization(
      "organization-1",
      {
        expectedRevision: "organization-revision",
        name: "Renamed organization",
      },
      { idempotencyKey: "organization-key" }
    );
    await client.deleteWorkspace(
      "organization-1",
      "workspace-1",
      "preview-secret",
      { idempotencyKey: "delete-key" }
    );

    expect(requests[0]?.headers.get("Authorization")).toBe(
      "Bearer oauth-token"
    );
    expect(requests[0]?.headers.get("If-Match")).toBe('"revision-1"');
    expect(requests[0]?.headers.get("Idempotency-Key")).toBe("request-key");
    expect(requests[1]?.headers.get("If-Match")).toBe(
      '"organization-revision"'
    );
    expect(requests[2]?.headers.get("X-Lunaris-Preview")).toBe(
      "preview-secret"
    );
    expect(requests[2]?.url).not.toContain("preview-secret");
  });

  it("resolves OAuth access tokens for every request", async () => {
    const requests: Request[] = [];
    let token = "first-token";
    const client = new CloudLunarisControlClient({
      accessToken: async () => token,
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ items: [], nextCursor: null });
      },
    });

    await client.listOrganizations();
    token = "refreshed-token";
    await client.listOrganizations();

    expect(requests[0]?.headers.get("Authorization")).toBe(
      "Bearer first-token"
    );
    expect(requests[1]?.headers.get("Authorization")).toBe(
      "Bearer refreshed-token"
    );
  });

  it("does not duplicate path workspace ids in file URL queries", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          downloadUrl: "https://files.lunaris.test/file",
        });
      },
    });

    await client.getFileDownloadUrl(
      "organization-1",
      "workspace-1",
      "attachment-1"
    );

    expect(request?.url).toBe(
      "https://api.lunaris.test/v1/organizations/organization-1/workspaces/workspace-1/storage/attachment-1/file/download-url"
    );
  });

  it("sends built-in extension operations through the generic plugin route", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          boardId: "board-1",
          name: "Ship it",
          properties: { status: "done" },
          taskId: "task-1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      },
    });

    await client.executePluginOperation(
      "organization-1",
      "workspace-1",
      "lunaris.kanban",
      "update_task",
      {
        boardId: "board-1",
        expectedRevision: "revision-1",
        properties: { Status: "Done" },
        taskId: "task-1",
      },
      { idempotencyKey: "request-key" }
    );

    expect(request?.url).toBe(
      "https://api.lunaris.test/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/update_task"
    );
    expect(request?.headers.get("If-Match")).toBe('"revision-1"');
    expect(request?.headers.get("Idempotency-Key")).toBe("request-key");
    expect(await request?.json()).toEqual({
      boardId: "board-1",
      properties: { Status: "Done" },
      taskId: "task-1",
    });
  });

  it("reads built-in extension properties through a GET query", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          boardId: "board-1",
          properties: [
            {
              id: "status",
              name: "Status",
              options: [],
              type: "select",
            },
          ],
        });
      },
    });

    await client.executePluginOperation(
      "organization-1",
      "workspace-1",
      "lunaris.kanban",
      "get_board_properties",
      { boardId: "board-1" }
    );

    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(
      "https://api.lunaris.test/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/get_board_properties?boardId=board-1"
    );
    expect(request?.headers.get("Idempotency-Key")).toBeNull();
  });

  it("serializes workspace-resource deletion guards", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          action: "delete_resource",
          expiresAt: "2026-01-01T00:05:00.000Z",
          impact: {
            documents: 0,
            resources: 1,
            members: 0,
            workspaces: 0,
          },
          previewToken: "preview-1",
          targetId: "task-1",
        });
      },
    });

    await client.previewDeleteWorkspaceResource(
      "organization-1",
      "workspace-1",
      "task-1",
      { expectedResourceTypeId: "lunaris.kanban.task" }
    );

    expect(request?.url).toContain(
      "expectedResourceTypeId=lunaris.kanban.task"
    );
  });

  it("serializes workspace-resource parent guards", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          createdAt: "2026-01-01T00:00:00.000Z",
          icon: null,
          id: "task-1",
          name: "Ship it",
          parentId: "board-1",
          resourceTypeId: "lunaris.kanban.task",
          schemaVersion: 1,
          position: 0,
          workspaceId: "workspace-1",
          storage: {},
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      },
    });

    await client.createWorkspaceResource(
      "organization-1",
      "workspace-1",
      {
        resourceTypeId: "lunaris.kanban.task",
        schemaVersion: 1,
        name: "Ship it",
        parentId: "board-1",
        storage: {},
      },
      {
        expectedParentResourceTypeId: "lunaris.kanban",
        idempotencyKey: "request-1",
      }
    );

    expect(request?.url).toContain(
      "expectedParentResourceTypeId=lunaris.kanban"
    );
  });

  it("searches organization resources with optional workspace context", async () => {
    let request: Request | undefined;
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ items: [], nextCursor: null });
      },
    });

    await client.searchResources("organization one", {
      cursor: "next page",
      limit: 20,
      workspaceId: "workspace one",
      search: "road map",
    });

    expect(request?.url).toBe(
      "https://api.lunaris.test/v1/organizations/organization%20one/resources?cursor=next+page&limit=20&workspaceId=workspace+one&search=road+map"
    );
  });

  it("rejects successful responses that violate the operation contract", async () => {
    const client = new CloudLunarisControlClient({
      apiKey: "secret-key",
      baseUrl: "https://api.lunaris.test",
      fetch: async () => Response.json({ unexpected: true }),
    });

    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      status: 502,
    });
  });
});
