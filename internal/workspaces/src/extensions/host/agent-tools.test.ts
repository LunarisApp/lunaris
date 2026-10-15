import type { LunarisControlClient } from "@repo/agent-contracts";
import { describe, expect, it } from "vitest";
import {
  assertAgentToolWorkspaceContext,
  builtInAgentToolPolicy,
  executeBuiltInAgentTool,
} from "./agent-tools";

const context = {
  workspaceId: "workspace-1",
  organizationId: "organization-1",
};

describe("built-in agent tools", () => {
  it("rejects execution after the active workspace changes", () => {
    expect(() =>
      assertAgentToolWorkspaceContext("workspace-1", "workspace-2")
    ).toThrow("active workspace changed");
    expect(() =>
      assertAgentToolWorkspaceContext("workspace-1", "workspace-1")
    ).not.toThrow();
  });

  it.each([
    ["kanban_list_boards", "read"],
    ["kanban_create_board", "mutation"],
    ["kanban_get_board_properties", "read"],
    ["kanban_list_tasks", "read"],
    ["kanban_create_task", "mutation"],
    ["kanban_update_task", "mutation"],
    ["kanban_preview_delete_task", "read"],
    ["kanban_delete_task", "mutation"],
    ["rich_text_read_me", "read"],
    ["rich_text_list_documents", "read"],
    ["rich_text_create_document", "mutation"],
    ["rich_text_get_document", "read"],
    ["rich_text_update_document", "mutation"],
    ["rich_text_preview_delete_document", "read"],
    ["rich_text_delete_document", "mutation"],
  ] as const)("classifies %s as %s", (name, policy) => {
    expect(builtInAgentToolPolicy(name)).toBe(policy);
  });

  it("injects active context and fixed filters for task listing", async () => {
    const calls: unknown[][] = [];
    const client = {
      listWorkspaceResources: async (...args: unknown[]) => {
        calls.push(args);
        return { items: [], nextCursor: null };
      },
    } as unknown as LunarisControlClient;

    await executeBuiltInAgentTool(
      client,
      "kanban_list_tasks",
      { boardId: "board-1", limit: 20 },
      context
    );

    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        {
          limit: 20,
          parentId: "board-1",
          resourceTypeId: "lunaris.kanban.task",
        },
      ],
    ]);
  });

  it("runs task mutations through the extension operation port", async () => {
    const calls: unknown[][] = [];
    const client = {
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

    const output = await executeBuiltInAgentTool(
      client,
      "kanban_create_task",
      {
        boardId: "board-1",
        idempotencyKey: "request-1",
        name: "Ship it",
        properties: { Priority: "High" },
      },
      context
    );

    expect(output).toMatchObject({ taskId: "task-1" });
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
  });

  it("creates boards with the fixed Kanban resource type", async () => {
    const calls: unknown[][] = [];
    const client = {
      createWorkspaceResource: async (...args: unknown[]) => {
        calls.push(args);
        return {
          createdAt: "2026-01-01T00:00:00.000Z",
          icon: null,
          id: "board-1",
          name: "Roadmap",
          parentId: null,
          resourceTypeId: "lunaris.kanban",
          schemaVersion: 1,
          position: 0,
          workspaceId: "workspace-1",
          storage: { content: { kind: "yjs", storageId: "storage-1" } },
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      },
    } as unknown as LunarisControlClient;

    await executeBuiltInAgentTool(
      client,
      "kanban_create_board",
      {
        idempotencyKey: "request-1",
        name: "Roadmap",
        parentId: null,
      },
      context
    );

    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        {
          name: "Roadmap",
          parentId: null,
          resourceTypeId: "lunaris.kanban",
          schemaVersion: 1,
          storage: { content: { kind: "yjs" } },
        },
        {
          expectedParentResourceTypeId: undefined,
          idempotencyKey: "request-1",
        },
      ],
    ]);
  });

  it("previews and deletes only Kanban tasks", async () => {
    const calls: unknown[][] = [];
    const client = {
      deleteWorkspaceResource: async (...args: unknown[]) => {
        calls.push(args);
        return { id: "task-1" };
      },
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

    await executeBuiltInAgentTool(
      client,
      "kanban_preview_delete_task",
      { taskId: "task-1" },
      context
    );
    await executeBuiltInAgentTool(
      client,
      "kanban_delete_task",
      {
        idempotencyKey: "request-1",
        previewToken: "preview-1",
        taskId: "task-1",
      },
      context
    );

    expect(calls).toEqual([
      [
        "organization-1",
        "workspace-1",
        "task-1",
        { expectedResourceTypeId: "lunaris.kanban.task" },
      ],
      [
        "organization-1",
        "workspace-1",
        "task-1",
        "preview-1",
        {
          expectedResourceTypeId: "lunaris.kanban.task",
          idempotencyKey: "request-1",
        },
      ],
    ]);
  });
});
