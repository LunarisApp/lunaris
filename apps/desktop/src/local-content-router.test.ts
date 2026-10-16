import type { LunarisControlClient } from "@repo/agent-contracts";
import { describe, expect, it, vi } from "vitest";
import { routeLocalContentRequest } from "./local-content-router";

function client(): LunarisControlClient {
  return {
    getYjsStorageJson: vi.fn(),
    getWorkspace: vi.fn(),
    getWorkspaceResource: vi.fn(),
    listWorkspaceResources: vi.fn(),
    listWorkspaces: vi.fn(),
    searchResources: vi.fn(),
  } as unknown as LunarisControlClient;
}

describe("routeLocalContentRequest", () => {
  it("routes Yjs storage JSON using the cloud-compatible path", async () => {
    const content = client();
    const result = await routeLocalContentRequest(content, {
      id: "request-1",
      method: "GET",
      path: "/v1/organizations/ws/workspaces/workspace/storage/storage/yjs/json",
      query: "",
    });

    expect(result.status).toBe(200);
    expect(content.getYjsStorageJson).toHaveBeenCalledWith(
      "ws",
      "workspace",
      "storage",
      expect.not.objectContaining({ consistency: expect.anything() })
    );
  });

  it("routes organization administration through the control client", async () => {
    const content = client();
    content.updateOrganization = vi.fn(async () => ({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "ws",
      logo: null,
      name: "Renamed",
      revision: "revision-2",
      slug: "organization",
    }));
    const result = await routeLocalContentRequest(content, {
      body: { name: "Renamed" },
      headers: {
        "idempotency-key": "request-key",
        "if-match": '"revision-1"',
      },
      id: "request-2",
      method: "PATCH",
      path: "/v1/organizations/ws",
      query: "",
    });

    expect(result.status).toBe(200);
    expect(content.updateOrganization).toHaveBeenCalledWith(
      "ws",
      { expectedRevision: "revision-1", name: "Renamed" },
      { idempotencyKey: "request-key" }
    );
  });

  it("forwards workspace mutations through the cloud-compatible contract", async () => {
    const control = client();
    control.createWorkspace = vi.fn(async () => ({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "workspace",
      name: "Workspace",
      organizationId: "ws",
      slug: "workspace",
      updatedAt: "2026-01-01T00:00:00.000Z",
      visibility: "local" as const,
    }));
    const result = await routeLocalContentRequest(control, {
      body: { name: "Workspace", slug: "workspace", visibility: "local" },
      headers: { "idempotency-key": "request-key" },
      id: "request-write",
      method: "POST",
      path: "/v1/organizations/ws/workspaces",
      query: "",
    });

    expect(result.status).toBe(200);
    expect(control.createWorkspace).toHaveBeenCalledWith(
      "ws",
      { name: "Workspace", slug: "workspace", visibility: "local" },
      { idempotencyKey: "request-key" }
    );
  });

  it("routes built-in extension operations through the control port", async () => {
    const control = client();
    control.executePluginOperation = vi.fn(async () => ({
      boardId: "board-1",
      name: "Ship it",
      properties: { status: "done" },
      taskId: "task-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const result = await routeLocalContentRequest(control, {
      body: {
        boardId: "board-1",
        properties: { Status: "Done" },
        taskId: "task-1",
      },
      headers: {
        "idempotency-key": "request-key",
        "if-match": '"revision-1"',
      },
      id: "plugin-write",
      method: "POST",
      path: "/v1/organizations/ws/workspaces/workspace/plugins/lunaris.kanban/operations/update_task",
      query: "",
    });

    expect(result.status).toBe(200);
    expect(control.executePluginOperation).toHaveBeenCalledWith(
      "ws",
      "workspace",
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
  });

  it("routes read-only extension operations from query parameters", async () => {
    const control = client();
    control.executePluginOperation = vi.fn(async () => ({
      boardId: "board-1",
      properties: [],
    }));
    const result = await routeLocalContentRequest(control, {
      headers: { "x-lunaris-consistency": "cached" },
      id: "plugin-read",
      method: "GET",
      path: "/v1/organizations/ws/workspaces/workspace/plugins/lunaris.kanban/operations/get_board_properties",
      query: "boardId=board-1",
    });

    expect(result.status).toBe(200);
    expect(control.executePluginOperation).toHaveBeenCalledWith(
      "ws",
      "workspace",
      "lunaris.kanban",
      "get_board_properties",
      { boardId: "board-1" },
      expect.objectContaining({ consistency: "cached" })
    );
  });

  it("rejects malformed query values instead of coercing them", async () => {
    const content = client();
    const result = await routeLocalContentRequest(content, {
      id: "request-3",
      method: "GET",
      path: "/v1/organizations/ws/workspaces",
      query: "limit=10oops",
    });

    expect(result).toEqual({
      body: {
        code: "INVALID_REQUEST",
        message: "Request input is invalid",
      },
      status: 400,
    });
    expect(content.listWorkspaces).not.toHaveBeenCalled();
  });

  it("forwards explicit cached consistency to Desktop reads", async () => {
    const content = client();
    content.listWorkspaces = vi.fn(async () => ({
      items: [],
      nextCursor: null,
    }));

    await routeLocalContentRequest(content, {
      headers: { "x-lunaris-consistency": "cached" },
      id: "request-cached",
      method: "GET",
      path: "/v1/organizations/ws/workspaces",
      query: "",
    });

    expect(content.listWorkspaces).toHaveBeenCalledWith(
      "ws",
      { limit: 50 },
      expect.objectContaining({ consistency: "cached" })
    );
  });

  it("rejects invalid consistency headers", async () => {
    const content = client();
    const result = await routeLocalContentRequest(content, {
      headers: { "x-lunaris-consistency": "eventual" },
      id: "request-invalid-consistency",
      method: "GET",
      path: "/v1/organizations/ws/workspaces",
      query: "",
    });

    expect(result).toEqual({
      body: {
        code: "INVALID_REQUEST",
        message: "X-Lunaris-Consistency is invalid",
      },
      status: 400,
    });
    expect(content.listWorkspaces).not.toHaveBeenCalled();
  });

  it("rejects malformed path encoding", async () => {
    const result = await routeLocalContentRequest(client(), {
      id: "request-4",
      method: "GET",
      path: "/v1/organizations/%E0%A4%A/workspaces",
      query: "",
    });

    expect(result).toEqual({
      body: {
        code: "INVALID_REQUEST",
        message: "Request path is invalid",
      },
      status: 400,
    });
  });

  it("does not expose unexpected local database errors", async () => {
    const content = client();
    content.listWorkspaces = vi.fn(async () => {
      throw Object.assign(new Error("SQLITE_ERROR: secret schema details"), {
        code: "SQLITE_ERROR",
        status: 500,
      });
    });

    const result = await routeLocalContentRequest(content, {
      id: "request-5",
      method: "GET",
      path: "/v1/organizations/ws/workspaces",
      query: "",
    });

    expect(result).toEqual({
      body: {
        code: "INTERNAL_ERROR",
        message: "Desktop agent request failed",
      },
      status: 500,
    });
    expect(JSON.stringify(result)).not.toContain("secret schema details");
  });
});
