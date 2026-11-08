import type { PluginLunarisContent } from "@lunarisapp/plugin-sdk";
import {
  builtInPluginMcpTools,
  builtInPluginMcpToolRisk,
} from "@repo/agent-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  getWebMcpContext,
  registerWorkspaceWebMcp,
  type WebMcpTool,
} from "./webmcp";

function setup() {
  const tools = new Map<string, WebMcpTool>();
  const controller = new AbortController();
  const content = {
    activeWorkspaceId: "workspace-1",
    activeResourceId: "resource-1",
    searchResources: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    executeAgentTool: vi.fn().mockResolvedValue({ blocks: [] }),
  } as unknown as PluginLunarisContent;
  const context = {
    registerTool: vi.fn(
      (tool: WebMcpTool, { signal }: { signal: AbortSignal }) => {
        tools.set(tool.name, tool);
        signal.addEventListener("abort", () => tools.delete(tool.name), {
          once: true,
        });
      }
    ),
  };
  const register = (
    enabledPluginIds = new Set<string>(),
    options: Partial<Parameters<typeof registerWorkspaceWebMcp>[0]> = {}
  ) =>
    registerWorkspaceWebMcp({
      context,
      content,
      enabledPluginIds,
      signal: controller.signal,
      ...options,
    });
  return { tools, controller, content, context, register };
}

describe("workspace WebMCP", () => {
  it("skips unsupported browsers", () => {
    expect(getWebMcpContext(document)).toBeUndefined();
  });

  it("limits search to the captured workspace and validates inputs", async () => {
    const { register, tools, content } = setup();
    await register();
    const search = tools.get("lunaris_search_resources")!;
    await search.execute({ search: "notes", workspaceId: "other" });
    expect(content.searchResources).toHaveBeenCalledWith({
      search: "notes",
      limit: 50,
      workspaceId: "workspace-1",
    });
    await expect(
      search.execute({ search: "notes", limit: 101 })
    ).rejects.toThrow();
    expect(content.searchResources).toHaveBeenCalledTimes(1);
    await expect(
      tools.get("lunaris_get_context")!.execute({})
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      resourceId: "resource-1",
    });
  });

  it("exposes only enabled plugin reads and hides host identity in schemas", async () => {
    const { register, tools, content } = setup();
    const definition = builtInPluginMcpTools.find(
      (tool) => tool.name === "rich_text_read_me"
    )!;
    await register(new Set([definition.pluginId]));
    for (const tool of builtInPluginMcpTools) {
      expect(tools.has(`lunaris_${tool.name}`)).toBe(
        tool.pluginId === definition.pluginId &&
          builtInPluginMcpToolRisk(tool) === "read"
      );
    }
    const read = tools.get("lunaris_rich_text_read_me")!;
    expect(read.inputSchema).not.toHaveProperty("properties.workspaceId");
    expect(read.inputSchema).not.toHaveProperty("properties.organizationId");
    await read.execute({});
    expect(content.executeAgentTool).toHaveBeenCalledWith({
      name: "rich_text_read_me",
      input: {},
      workspaceId: "workspace-1",
    });
  });

  it("unregisters on cleanup and rejects stale calls and late results", async () => {
    const { register, tools, content, controller } = setup();
    await register();
    const search = tools.get("lunaris_search_resources")!;
    vi.mocked(content.searchResources).mockImplementation(async () => {
      controller.abort();
      return { items: [], nextCursor: null };
    });
    await expect(search.execute({ search: "notes" })).rejects.toThrow();
    expect(tools.size).toBe(0);
    await expect(search.execute({ search: "notes" })).rejects.toThrow();
    expect(content.searchResources).toHaveBeenCalledTimes(1);
  });

  it("does not register without an active workspace or after cleanup", async () => {
    const { content, controller, context, register } = setup();
    content.activeWorkspaceId = "";
    await register();
    content.activeWorkspaceId = "workspace-1";
    controller.abort();
    await register();
    expect(context.registerTool).not.toHaveBeenCalled();
  });
});

describe("expanded WebMCP tools", () => {
  const plugins = new Set(["lunaris.rich-text", "lunaris.kanban"]);
  const resource = {
    resourceId: "resource-1",
    resourceTypeId: "lunaris.rich-text",
    name: "Notes",
    schemaVersion: 1,
    parentId: null,
    storage: {},
  };

  it("exposes only the authorized mutation allowlist", async () => {
    const { register, tools, content } = setup();
    await register(plugins, { canWrite: true });
    for (const name of [
      "rich_text_create_document",
      "kanban_create_board",
      "kanban_create_task",
      "kanban_update_task",
      "rich_text_edit_document",
    ]) {
      expect(tools.get(`lunaris_${name}`)?.annotations).toMatchObject({
        readOnlyHint: false,
        consequentialHint: true,
      });
    }
    for (const name of [
      "rich_text_delete_document",
      "rich_text_update_document",
      "kanban_delete_task",
    ]) {
      expect(tools.has(`lunaris_${name}`)).toBe(false);
    }
    const create = tools.get("lunaris_kanban_create_task")!;
    await expect(
      create.execute({ boardId: "board", name: "Task" })
    ).rejects.toThrow();
    await create.execute({
      boardId: "board",
      name: "Task",
      idempotencyKey: "create-task-1",
      workspaceId: "other",
    });
    expect(content.executeAgentTool).toHaveBeenCalledWith({
      name: "kanban_create_task",
      workspaceId: "workspace-1",
      input: {
        boardId: "board",
        name: "Task",
        idempotencyKey: "create-task-1",
      },
    });
  });

  it("reads active Rich Text and Kanban resources without supplied IDs", async () => {
    const { register, tools, content } = setup();
    const resources = new Map([[resource.resourceId, resource]]);
    await register(plugins, { resources });
    await tools.get("lunaris_read_active_resource")!.execute({});
    expect(content.executeAgentTool).toHaveBeenLastCalledWith({
      name: "rich_text_get_document",
      workspaceId: "workspace-1",
      input: { documentResourceId: "resource-1" },
    });
    resources.set(resource.resourceId, {
      ...resource,
      resourceTypeId: "lunaris.kanban",
    });
    await tools.get("lunaris_read_active_resource")!.execute({});
    expect(content.executeAgentTool).toHaveBeenLastCalledWith({
      name: "kanban_get_board",
      workspaceId: "workspace-1",
      input: { boardId: "resource-1" },
    });
  });

  it("keeps the original undo snapshot across retries and registration changes", async () => {
    const { register, tools, content } = setup();
    const undoEdits = new Map();
    const blocks = [
      {
        id: "block",
        type: "paragraph",
        props: {},
        children: [],
        content: "Original",
      },
    ];
    vi.mocked(content.executeAgentTool).mockImplementation(async ({ name }) =>
      name === "rich_text_get_document"
        ? { blocks, revision: "before" }
        : { revision: "after" }
    );
    await register(plugins, { canWrite: true, undoEdits });
    const input = {
      documentResourceId: "resource-1",
      expectedRevision: "before",
      idempotencyKey: "edit-key-1",
      edits: [{ op: "update", blockId: "block", content: "Changed" }],
    };
    await expect(
      tools.get("lunaris_rich_text_edit_document")!.execute(input)
    ).resolves.toMatchObject({ undoToken: "edit-key-1" });
    await tools.get("lunaris_rich_text_edit_document")!.execute(input);
    await register(plugins, { canWrite: true, undoEdits });
    const undo = tools.get("lunaris_undo_rich_text_edit")!;
    await undo.execute({
      undoToken: "edit-key-1",
      idempotencyKey: "undo-key-1",
    });
    expect(content.executeAgentTool).toHaveBeenLastCalledWith({
      name: "rich_text_update_document",
      workspaceId: "workspace-1",
      input: {
        documentResourceId: "resource-1",
        blocks,
        expectedRevision: "after",
        idempotencyKey: "undo-key-1",
      },
    });
  });

  it("rejects stale edits before dispatch and propagates undo revision conflicts", async () => {
    const { register, tools, content } = setup();
    vi.mocked(content.executeAgentTool).mockResolvedValue({
      blocks: [],
      revision: "current",
    });
    await register(plugins, {
      canWrite: true,
      undoEdits: new Map([
        [
          "edit-key-1",
          { documentResourceId: "resource-1", blocks: [], revision: "old" },
        ],
      ]),
    });
    await expect(
      tools.get("lunaris_rich_text_edit_document")!.execute({
        documentResourceId: "resource-1",
        expectedRevision: "stale",
        idempotencyKey: "edit-key-2",
        edits: [{ op: "update", blockId: "block", content: "text" }],
      })
    ).rejects.toThrow("revision changed");
    expect(content.executeAgentTool).toHaveBeenCalledTimes(1);
    vi.mocked(content.executeAgentTool).mockRejectedValueOnce(
      new Error("REVISION_CHANGED")
    );
    await expect(
      tools
        .get("lunaris_undo_rich_text_edit")!
        .execute({ undoToken: "edit-key-1", idempotencyKey: "undo-key-1" })
    ).rejects.toThrow("REVISION_CHANGED");
  });
});

it("does not dispatch an edit if navigation cancels its snapshot read", async () => {
  const { register, tools, content, controller } = setup();
  await register(new Set(["lunaris.rich-text"]), { canWrite: true });
  vi.mocked(content.executeAgentTool).mockImplementation(async () => {
    controller.abort();
    return { blocks: [], revision: "before" };
  });
  await expect(
    tools.get("lunaris_rich_text_edit_document")!.execute({
      documentResourceId: "resource-1",
      expectedRevision: "before",
      idempotencyKey: "edit-key-1",
      edits: [{ op: "update", blockId: "block", content: "text" }],
    })
  ).rejects.toThrow();
  expect(content.executeAgentTool).toHaveBeenCalledTimes(1);
});

it("opens only workspace resources and checks authorization before file reads", async () => {
  const { register, tools, content } = setup();
  const openResource = vi.fn();
  const readFile = vi.fn().mockResolvedValue({ text: "hello" });
  const resource = {
    resourceId: "resource-1",
    name: "Notes",
    resourceTypeId: "lunaris.file",
    schemaVersion: 1,
    parentId: null,
    storage: {},
  };
  await register(new Set(), {
    openResource,
    readFile,
    resources: new Map([[resource.resourceId, resource]]),
  });
  await expect(
    tools.get("lunaris_open_resource")!.execute({ resourceId: "other" })
  ).rejects.toThrow("unavailable");
  expect(openResource).not.toHaveBeenCalled();
  await tools
    .get("lunaris_open_resource")!
    .execute({ resourceId: "resource-1" });
  expect(openResource).toHaveBeenCalledWith("resource-1");
  vi.mocked(content.executeAgentTool).mockRejectedValueOnce(
    new Error("Access denied")
  );
  await expect(
    tools.get("lunaris_read_file")!.execute({ resourceId: "other" })
  ).rejects.toThrow("Access denied");
  expect(readFile).not.toHaveBeenCalled();
});

it("applies a captured selection once and retains its receipt on identical retries", async () => {
  const { register, tools, content } = setup();
  const apply = vi.fn();
  const selections = new Map([
    ["selection-1", { resourceId: "resource-1", revision: "before", apply }],
  ]);
  vi.mocked(content.executeAgentTool)
    .mockResolvedValueOnce({ revision: "before" })
    .mockResolvedValueOnce({ revision: "after" });
  await register(new Set(["lunaris.rich-text"]), {
    canWrite: true,
    selections,
  });
  const edit = tools.get("lunaris_edit_editor_selection")!;
  const input = {
    selectionToken: "selection-1",
    expectedRevision: "before",
    idempotencyKey: "selection-key-1",
    edit: { text: "Changed" },
  };
  await expect(edit.execute(input)).resolves.toMatchObject({
    revision: "after",
    applied: true,
  });
  await edit.execute(input);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(content.executeAgentTool).toHaveBeenCalledTimes(2);
  await expect(
    edit.execute({ ...input, edit: { text: "Other" } })
  ).rejects.toThrow("different input");
});
