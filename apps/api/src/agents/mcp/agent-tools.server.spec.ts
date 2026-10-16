import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import {
  agentMcpToolNames,
  agentResourceDefinitions,
  type LunarisControlClient,
} from "@repo/agent-contracts";
import { createAgentToolsServer } from "./agent-tools.server";

describe("agent tool registry", () => {
  test("exposes curated operations with structured results and annotations", async () => {
    const calls: string[] = [];
    const control = new Proxy(
      {},
      {
        get: (_target, property) => async () => {
          calls.push(String(property));
          return { items: [], nextCursor: null };
        },
      }
    ) as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    const desktopManifest = JSON.parse(
      await readFile(
        new URL(
          "../../../../../internal/agent-contracts/generated/agent-mcp-manifest.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      tools: Array<{
        annotations: unknown;
        description: string;
        inputSchema: unknown;
        name: string;
        offlineAvailability: string;
        outputSchema: unknown;
      }>;
    };
    const resources = await client.listResourceTemplates();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
      [...agentMcpToolNames].sort()
    );
    const hostedCatalog: unknown = listed.tools.map((tool) => ({
      annotations: tool.annotations,
      description: tool.description,
      inputSchema: tool.inputSchema,
      name: tool.name,
      offlineAvailability: tool._meta?.["app.lunaris/offlineAvailability"],
      outputSchema: tool.outputSchema,
    }));
    const desktopCatalog: unknown = desktopManifest.tools.map(
      ({
        annotations,
        description,
        inputSchema,
        name,
        offlineAvailability,
        outputSchema,
      }) => ({
        annotations,
        description,
        inputSchema,
        name,
        offlineAvailability,
        outputSchema,
      })
    );
    expect(hostedCatalog).toEqual(desktopCatalog);
    expect(
      listed.tools.find((tool) => tool.name === "delete_workspace")?.annotations
    ).toMatchObject({ destructiveHint: true, idempotentHint: true });
    expect(
      listed.tools.find((tool) => tool.name === "get_yjs_storage_json")
        ?.annotations
    ).toMatchObject({ readOnlyHint: true });
    expect(
      listed.tools.find((tool) => tool.name === "preview_delete_workspace")
        ?.annotations
    ).toMatchObject({ idempotentHint: false });
    expect(
      listed.tools.find((tool) => tool.name === "list_organizations")
        ?.outputSchema
    ).toBeDefined();
    expect(
      listed.tools.find((tool) => tool.name === "update_organization")?._meta
    ).toMatchObject({
      "app.lunaris/offlineAvailability": "cloud-required",
    });
    expect(
      listed.tools.find((tool) => tool.name === "kanban_list_tasks")?._meta
    ).toMatchObject({
      "app.lunaris/offlineAvailability": "supported",
      "app.lunaris/pluginId": "lunaris.kanban",
    });

    const result = await client.callTool({
      arguments: { limit: 10 },
      name: "list_organizations",
    });
    expect(result.structuredContent).toEqual({ items: [], nextCursor: null });
    const searchResult = await client.callTool({
      arguments: { search: "plan", organizationId: "organization-1" },
      name: "search_resources",
    });
    expect(searchResult.structuredContent).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(
      listed.tools.find((tool) => tool.name === "search_resources")?.annotations
    ).toMatchObject({ readOnlyHint: true });
    expect(
      listed.tools.find((tool) => tool.name === "search_resources")?.description
    ).toContain("Organization-wide search is the default");
    expect(
      listed.tools.find((tool) => tool.name === "search_resources")?.description
    ).toContain("exact workspace ID is already known");
    expect(
      listed.tools.find((tool) => tool.name === "search_resources")?.inputSchema
    ).toMatchObject({
      properties: {
        workspaceId: {
          description:
            "Optional exact workspace scope. Omit this field for the default organization-wide search. Use it only when the exact workspace ID is already known and the search should intentionally be limited to that workspace.",
        },
      },
    });
    const tasksResult = await client.callTool({
      arguments: {
        boardId: "board-1",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      },
      name: "kanban_list_tasks",
    });
    expect(tasksResult.structuredContent).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(calls).toEqual([
      "listOrganizations",
      "searchResources",
      "listWorkspaceResources",
    ]);
    expect(
      resources.resourceTemplates.map(({ name, uriTemplate }) => ({
        name,
        uriTemplate,
      }))
    ).toEqual(
      agentResourceDefinitions.map(({ name, uriTemplate }) => ({
        name,
        uriTemplate,
      }))
    );
    await client.close();
    await server.close();
  });

  test("executes Kanban creation with properties through the extension port", async () => {
    const calls: unknown[][] = [];
    const control = {
      executePluginOperation: async (...args: unknown[]) => {
        calls.push(args);
        return {
          boardId: "board-1",
          name: "Ship it",
          position: 0,
          properties: { priority: "high" },
          taskId: "task-1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      },
    } as unknown as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const call = await client.callTool({
      arguments: {
        boardId: "board-1",
        idempotencyKey: "request-1",
        name: "Ship it",
        workspaceId: "workspace-1",
        properties: { Priority: "High" },
        organizationId: "organization-1",
      },
      name: "kanban_create_task",
    });

    expect(call.isError).not.toBe(true);
    expect(call.structuredContent).toMatchObject({
      properties: { priority: "high" },
      taskId: "task-1",
    });
    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        "lunaris.kanban",
        "create_task",
        {
          boardId: "board-1",
          name: "Ship it",
          properties: { Priority: "High" },
        },
        { idempotencyKey: "request-1" },
      ],
    ]);
    await client.close();
    await server.close();
  });

  test("guards Kanban task deletion previews by resource type", async () => {
    const calls: unknown[][] = [];
    const control = {
      previewDeleteWorkspaceResource: async (...args: unknown[]) => {
        calls.push(args);
        return {
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
        };
      },
    } as unknown as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const call = await client.callTool({
      arguments: {
        workspaceId: "workspace-1",
        taskId: "task-1",
        organizationId: "organization-1",
      },
      name: "kanban_preview_delete_task",
    });

    expect(call.isError).not.toBe(true);
    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        "task-1",
        { expectedResourceTypeId: "lunaris.kanban.task" },
      ],
    ]);
    await client.close();
    await server.close();
  });

  test("executes Kanban task updates through the extension operation port", async () => {
    const calls: unknown[][] = [];
    const control = {
      executePluginOperation: async (...args: unknown[]) => {
        calls.push(args);
        return {
          boardId: "board-1",
          name: "Ship it",
          properties: { priority: "high" },
          taskId: "task-1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      },
    } as unknown as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const call = await client.callTool({
      arguments: {
        boardId: "board-1",
        idempotencyKey: "request-1",
        workspaceId: "workspace-1",
        properties: { Priority: "High" },
        taskId: "task-1",
        organizationId: "organization-1",
      },
      name: "kanban_update_task",
    });

    expect(call.isError).not.toBe(true);
    expect(call.structuredContent).toMatchObject({
      properties: { priority: "high" },
      taskId: "task-1",
    });
    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        "lunaris.kanban",
        "update_task",
        {
          boardId: "board-1",
          properties: { Priority: "High" },
          taskId: "task-1",
        },
        { idempotencyKey: "request-1" },
      ],
    ]);
    await client.close();
    await server.close();
  });

  test("executes the Kanban board property getter without idempotency", async () => {
    const calls: unknown[][] = [];
    const control = {
      executePluginOperation: async (...args: unknown[]) => {
        calls.push(args);
        return {
          boardId: "board-1",
          properties: [
            {
              id: "status",
              name: "Status",
              options: [{ color: "#22c55e", id: "done", name: "Done" }],
              type: "select",
            },
          ],
        };
      },
    } as unknown as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const call = await client.callTool({
      arguments: {
        boardId: "board-1",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      },
      name: "kanban_get_board_properties",
    });

    expect(call.isError).not.toBe(true);
    expect(call.structuredContent).toMatchObject({
      boardId: "board-1",
      properties: [{ id: "status", name: "Status" }],
    });
    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        "lunaris.kanban",
        "get_board_properties",
        { boardId: "board-1" },
        { idempotencyKey: undefined },
      ],
    ]);
    await client.close();
    await server.close();
  });

  test("rejects handler output that violates the shared contract", async () => {
    const control = new Proxy(
      {},
      { get: () => async () => ({ unexpected: true }) }
    ) as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      arguments: { limit: 10 },
      name: "list_organizations",
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "INTERNAL_ERROR" });
    await client.close();
    await server.close();
  });

  test("maps in-process HTTP errors to stable structured codes", async () => {
    const control = new Proxy(
      {},
      {
        get: () => async () => {
          const error = new Error(
            "Missing scope: organization:read"
          ) as Error & {
            getStatus: () => number;
          };
          error.getStatus = () => 403;
          throw error;
        },
      }
    ) as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      arguments: { limit: 10 },
      name: "list_organizations",
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "HTTP_403",
      message: "Missing scope: organization:read",
      status: 403,
    });
    await client.close();
    await server.close();
  });

  test("preserves structured in-process application errors", async () => {
    const control = new Proxy(
      {},
      {
        get: () => async () => {
          const error = new Error("Revision changed") as Error & {
            getResponse: () => unknown;
            getStatus: () => number;
          };
          error.getStatus = () => 409;
          error.getResponse = () => ({
            code: "REVISION_CHANGED",
            details: { expected: "old" },
            message: "Revision changed",
          });
          throw error;
        },
      }
    ) as LunarisControlClient;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createAgentToolsServer(control);
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      arguments: { limit: 10 },
      name: "list_organizations",
    });

    expect(result.structuredContent).toEqual({
      code: "REVISION_CHANGED",
      details: { expected: "old" },
      message: "Revision changed",
      status: 409,
    });
    await client.close();
    await server.close();
  });
});
