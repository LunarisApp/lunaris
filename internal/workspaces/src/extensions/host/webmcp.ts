import {
  captureAgentEditorSelection,
  type SelectionEdit,
} from "@extension/rich-text/agent-editor";
import type {
  PluginLunarisContent,
  PluginResourcesMap,
} from "@lunarisapp/plugin-sdk";
import {
  agentOperationContracts,
  builtInPluginMcpToolRisk,
  builtInPluginMcpTools,
} from "@repo/agent-contracts";
import * as z from "zod";
import { captureResourceSelection } from "./webmcp-selection";

export interface WebMcpTool {
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: true;
    consequentialHint: boolean;
  };
  description: string;
  execute(input: Record<string, unknown>): Promise<unknown>;
  inputSchema: object;
  name: string;
}

export interface WebMcpContext {
  registerTool(
    tool: WebMcpTool,
    options: { signal: AbortSignal }
  ): Promise<void> | void;
}

export interface WebMcpSelection {
  applied?: boolean;
  apply: (edit: SelectionEdit) => void;
  request?: string;
  resourceId: string;
  result?: unknown;
  revision: string;
}

export interface WebMcpUndoEdit {
  blocks: unknown[];
  documentResourceId: string;
  result?: unknown;
  revision: string;
}

const searchSchema = z.object({
  search: z.string().min(1).max(1000),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
const emptySchema = z.object({}).strict();

function workspaceToolInput(schema: z.ZodObject) {
  const {
    organizationId: _organizationId,
    workspaceId: _workspaceId,
    ...shape
  } = schema.shape;
  // Cross-field refinements run through the original contract at dispatch.
  return z.object(shape);
}

/** Keep the experimental browser API isolated from the host and SDK contracts. */
export async function registerWorkspaceWebMcp({
  context,
  content,
  enabledPluginIds,
  signal,
  resources = new Map(),
  target,
  undoEdits = new Map<string, WebMcpUndoEdit>(),
  canWrite = false,
  openResource,
  readFile,
  selections = new Map<string, WebMcpSelection>(),
}: {
  context: WebMcpContext;
  content: PluginLunarisContent;
  enabledPluginIds: ReadonlySet<string>;
  signal: AbortSignal;
  resources?: PluginResourcesMap;
  target?: Document;
  undoEdits?: Map<string, WebMcpUndoEdit>;
  canWrite?: boolean;
  openResource?: (resourceId: string) => void;
  readFile?: (resourceId: string) => Promise<unknown>;
  selections?: Map<string, WebMcpSelection>;
}): Promise<void> {
  const workspaceId = content.activeWorkspaceId;
  if (!workspaceId || signal.aborted) {
    return;
  }
  const assertActive = () => signal.throwIfAborted();
  const register = async (
    name: string,
    description: string,
    schema: z.ZodObject,
    execute: (input: Record<string, unknown>) => Promise<unknown>,
    readOnly = true,
    checkResult = true
  ) => {
    assertActive();
    await context.registerTool(
      {
        name,
        description,
        inputSchema: z.toJSONSchema(schema, { io: "input" }),
        execute: async (input) => {
          assertActive();
          const result = await execute(schema.parse(input));
          if (checkResult) {
            assertActive();
          }
          return result;
        },
        annotations: {
          readOnlyHint: readOnly,
          untrustedContentHint: true,
          consequentialHint: !readOnly,
        },
      },
      { signal }
    );
  };

  await register(
    "lunaris_get_context",
    "Get the active Lunaris workspace and opened resource IDs.",
    emptySchema,
    async () => ({ workspaceId, resourceId: content.activeResourceId })
  );
  await register(
    "lunaris_search_resources",
    "Search resources in the active Lunaris workspace. Reuse returned resource IDs in read tools.",
    searchSchema,
    (input) =>
      content.searchResources({ ...searchSchema.parse(input), workspaceId })
  );
  await register(
    "lunaris_get_resource",
    "Read resource metadata and its updatedAt revision in the active workspace.",
    agentOperationContracts.get_resource.input.omit({
      organizationId: true,
      workspaceId: true,
    }),
    (input) =>
      content.executeAgentTool({ name: "get_resource", input, workspaceId })
  );
  if (openResource) {
    await register(
      "lunaris_open_resource",
      "Open a resource from the active workspace in the workbench.",
      z.object({ resourceId: z.string().min(1) }),
      async (input) => {
        const resourceId = String(input.resourceId);
        if (!resources.has(resourceId)) {
          throw new Error("Resource is unavailable in the active workspace.");
        }
        openResource(resourceId);
        return { opened: true, resourceId, workspaceId };
      },
      true,
      false
    );
  }
  if (readFile) {
    await register(
      "lunaris_read_file",
      "Read file metadata and cached UTF-8 text for supported files up to 1 MiB. Returns textStatus for unsupported or uncached files.",
      z.object({ resourceId: z.string().min(1) }),
      async (input) => {
        const resourceId = String(input.resourceId);
        await content.executeAgentTool({
          name: "get_resource",
          input: { resourceId },
          workspaceId,
        });
        assertActive();
        return { resourceId, workspaceId, file: await readFile(resourceId) };
      }
    );
  }
  if (canWrite) {
    await register(
      "lunaris_update_resource",
      "Rename or move a resource within the active workspace. Use updatedAt from lunaris_get_resource as expectedRevision; retain the idempotency key on retry.",
      workspaceToolInput(agentOperationContracts.update_resource.input),
      (input) =>
        content.executeAgentTool({
          name: "update_resource",
          input,
          workspaceId,
        }),
      false
    );
  }
  const activeResource = () => {
    const resource = content.activeResourceId
      ? resources.get(content.activeResourceId)
      : undefined;
    if (!resource) {
      throw new Error("No active resource. Open a resource and retry.");
    }
    return resource;
  };
  const readActive = async () => {
    const resource = activeResource();
    const name =
      resource.resourceTypeId === "lunaris.rich-text"
        ? "rich_text_get_document"
        : resource.resourceTypeId === "lunaris.kanban"
          ? "kanban_get_board"
          : null;
    if (!name) {
      return { workspaceId, resource };
    }
    const definition = builtInPluginMcpTools.find((tool) => tool.name === name);
    if (!(definition && enabledPluginIds.has(definition.pluginId))) {
      throw new Error("The active resource extension is unavailable.");
    }
    const input =
      name === "rich_text_get_document"
        ? { documentResourceId: resource.resourceId }
        : { boardId: resource.resourceId };
    return {
      workspaceId,
      resource,
      content: await content.executeAgentTool({ name, input, workspaceId }),
    };
  };
  await register(
    "lunaris_read_active_resource",
    "Read the opened resource, including native Rich Text blocks or the first Kanban page when supported.",
    emptySchema,
    readActive
  );
  await register(
    "lunaris_read_editor_selection",
    "Read selected text in the active Rich Text editor with its resource ID and revision. Reselect and retry if selection or content changes.",
    emptySchema,
    async () => {
      const resource = activeResource();
      if (resource.resourceTypeId !== "lunaris.rich-text" || !target) {
        throw new Error("Open a Rich Text resource and select text first.");
      }
      const selection = captureResourceSelection(target, resource.resourceId);
      if (!selection) {
        throw new Error(
          "Select up to 100,000 characters inside the active Rich Text editor."
        );
      }
      const result = await readActive();
      const revision = z
        .object({ revision: z.string() })
        .parse("content" in result ? result.content : null).revision;
      if (!selection.isCurrent()) {
        throw new Error(
          "Selection or content changed. Read the selection again."
        );
      }
      const editorSelection = captureAgentEditorSelection(
        resource.resourceId,
        target
      );
      const selectionToken = editorSelection ? crypto.randomUUID() : null;
      if (selectionToken && editorSelection) {
        selections.set(selectionToken, {
          resourceId: resource.resourceId,
          revision,
          apply: editorSelection.apply,
        });
        if (selections.size > 10) {
          selections.delete(selections.keys().next().value!);
        }
      }
      return {
        workspaceId,
        resourceId: resource.resourceId,
        text: selection.text,
        revision,
        selectionToken,
      };
    }
  );

  if (canWrite && enabledPluginIds.has("lunaris.rich-text")) {
    const selectionEditSchema = z.object({
      selectionToken: z.string().min(1),
      expectedRevision: z.string().min(1),
      idempotencyKey: z.string().min(8).max(200),
      edit: z.union([
        z.object({ text: z.string().max(100_000) }).strict(),
        z
          .object({
            format: z.enum(["bold", "italic", "underline", "strike"]),
            enabled: z.boolean(),
          })
          .strict(),
      ]),
    });
    await register(
      "lunaris_edit_editor_selection",
      "Replace or format a captured editor selection using its selectionToken and revision. Rejects content changes and preserves editor undo. Retry identical input after an uncertain outcome.",
      selectionEditSchema,
      async (input) => {
        const parsed = selectionEditSchema.parse(input);
        const selection = selections.get(parsed.selectionToken);
        if (!selection || selection.resourceId !== content.activeResourceId) {
          throw new Error(
            "Selection expired. Read the active editor selection again."
          );
        }
        const request = JSON.stringify(parsed);
        if (selection.request && selection.request !== request) {
          throw new Error("Selection token already used with different input.");
        }
        if (selection.result) {
          return selection.result;
        }
        const read = async () =>
          z.object({ revision: z.string() }).parse(
            await content.executeAgentTool({
              name: "rich_text_get_document",
              input: { documentResourceId: selection.resourceId },
              workspaceId,
            })
          );
        if (!selection.applied) {
          const current = await read();
          assertActive();
          if (
            parsed.expectedRevision !== selection.revision ||
            current.revision !== selection.revision
          ) {
            throw new Error(
              "Resource revision changed. Read the selection again."
            );
          }
          selection.apply(parsed.edit);
          selection.request = request;
          selection.applied = true;
        }
        const current = await read();
        selection.result = {
          resourceId: selection.resourceId,
          revision: current.revision,
          applied: true,
        };
        return selection.result;
      },
      false
    );
  }

  const executeEdit = async (input: Record<string, unknown>) => {
    const before = z
      .object({ blocks: z.array(z.unknown()), revision: z.string() })
      .parse(
        await content.executeAgentTool({
          name: "rich_text_get_document",
          input: { documentResourceId: input.documentResourceId },
          workspaceId,
        })
      );
    assertActive();
    // Replays keep their original undo snapshot and idempotency key.
    const undoToken = String(input.idempotencyKey);
    const previous = undoEdits.get(undoToken);
    if (!previous && before.revision !== input.expectedRevision) {
      throw new Error(
        "Resource revision changed. Read the resource and rebuild the edit."
      );
    }
    const result = await content.executeAgentTool({
      name: "rich_text_edit_document",
      input,
      workspaceId,
    });
    const revision = z.object({ revision: z.string() }).parse(result).revision;
    if (!previous) {
      undoEdits.set(undoToken, {
        documentResourceId: String(input.documentResourceId),
        blocks: before.blocks,
        revision,
      });
      if (undoEdits.size > 10) {
        undoEdits.delete(undoEdits.keys().next().value!);
      }
    }
    return { ...z.record(z.string(), z.unknown()).parse(result), undoToken };
  };
  if (canWrite && enabledPluginIds.has("lunaris.rich-text")) {
    await register(
      "lunaris_undo_rich_text_edit",
      "Undo a WebMCP Rich Text edit using its undoToken. Fails if the resource changed since that edit. Available for the last ten edits in this tool session.",
      z.object({
        undoToken: z.string().min(8),
        idempotencyKey: z.string().min(8).max(200),
      }),
      async (input) => {
        const edit = undoEdits.get(String(input.undoToken));
        if (!edit) {
          throw new Error(
            "Undo token expired or unknown. Read the resource before making further edits."
          );
        }
        if (edit.result) {
          return edit.result;
        }
        edit.result = await content.executeAgentTool({
          name: "rich_text_update_document",
          workspaceId,
          input: {
            documentResourceId: edit.documentResourceId,
            blocks: edit.blocks,
            expectedRevision: edit.revision,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return edit.result;
      },
      false
    );
  }
  const writableTools = new Set([
    "rich_text_create_document",
    "kanban_create_board",
    "kanban_create_task",
    "kanban_update_task",
    "rich_text_edit_document",
  ]);
  for (const tool of builtInPluginMcpTools) {
    if (
      (builtInPluginMcpToolRisk(tool) !== "read" &&
        !(canWrite && writableTools.has(tool.name))) ||
      !enabledPluginIds.has(tool.pluginId)
    ) {
      continue;
    }
    // Workspace identity belongs to the host, never to agent-supplied arguments.
    const schema = workspaceToolInput(tool.inputSchema);
    await register(
      `lunaris_${tool.name}`,
      tool.description,
      schema,
      (input) =>
        tool.name === "rich_text_edit_document"
          ? executeEdit(input)
          : content.executeAgentTool({ name: tool.name, input, workspaceId }),
      builtInPluginMcpToolRisk(tool) === "read"
    );
  }
}

export function getWebMcpContext(target: Document): WebMcpContext | undefined {
  const context = (target as Document & { modelContext?: WebMcpContext })
    .modelContext;
  return typeof context?.registerTool === "function" ? context : undefined;
}
