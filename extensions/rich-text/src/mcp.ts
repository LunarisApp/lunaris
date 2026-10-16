import { definePluginMcpCapabilities } from "@lunarisapp/plugin-sdk/mcp";
import * as z from "zod";
import { RICH_TEXT_PLUGIN_ID } from "./constants";
import {
  richTextDocumentOutputSchema,
  richTextGetDocumentInputSchema,
  richTextReadMeInputSchema,
  richTextReadMeOutputSchema,
  richTextUpdateDocumentInputSchema,
} from "./mcp-contract";

const id = (description: string) => z.string().min(1).describe(description);
const organizationId = id("Exact organization ID.");
const workspaceId = id("Exact workspace ID containing the Rich Text document.");
const documentResourceId = id("Exact Rich Text workspace resource ID.");
const idempotencyKey = z
  .string()
  .min(8)
  .max(200)
  .describe(
    "Stable unique key for this mutation. Reuse only when retrying the identical request."
  );
const pagination = {
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe("Opaque nextCursor from the previous page."),
  limit: z.number().int().min(1).max(100).default(50),
};

export const richTextMcpCapabilities = definePluginMcpCapabilities({
  extensionId: RICH_TEXT_PLUGIN_ID,
  tools: [
    {
      description:
        "Return the BlockNote document format, supported blocks, and editing rules. Call once before writing Rich Text content.",
      execution: {
        kind: "plugin",
        offlineAvailability: "supported",
        operation: "read_me",
        risk: "read",
        scope: "workspace:read",
      },
      inputSchema: richTextReadMeInputSchema,
      name: "rich_text_read_me",
      outputSchema: richTextReadMeOutputSchema,
    },
    {
      description:
        "List Rich Text documents in one known workspace. Returns resource metadata, not document blocks.",
      execution: {
        input: {
          cursor: { from: "cursor" },
          limit: { from: "limit" },
          resourceTypeId: { value: RICH_TEXT_PLUGIN_ID },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "list_resources",
      },
      inputSchema: z.object({ ...pagination, workspaceId, organizationId }),
      name: "rich_text_list_documents",
    },
    {
      description:
        "Create an empty Rich Text document in one known workspace. Then call rich_text_update_document to populate it.",
      execution: {
        input: {
          idempotencyKey: { from: "idempotencyKey" },
          name: { from: "name" },
          parentId: { from: "parentId" },
          resourceTypeId: { value: RICH_TEXT_PLUGIN_ID },
          position: { from: "position" },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "create_resource",
      },
      inputSchema: z.object({
        idempotencyKey,
        name: z.string().trim().min(1).describe("Document name."),
        parentId: id("Parent workspace resource ID.")
          .nullable()
          .optional()
          .describe("Parent item ID, or null to create at workspace root."),
        position: z.number().int().optional(),
        workspaceId,
        organizationId,
      }),
      name: "rich_text_create_document",
    },
    {
      description:
        "Read one Rich Text document's complete lossless BlockNote tree, lossy Markdown preview, and revision.",
      execution: {
        kind: "plugin",
        offlineAvailability: "supported",
        operation: "get_document",
        risk: "read",
        scope: "workspace:read",
      },
      inputSchema: richTextGetDocumentInputSchema,
      name: "rich_text_get_document",
      outputSchema: richTextDocumentOutputSchema,
    },
    {
      description:
        "Atomically replace one Rich Text document with a complete BlockNote tree. Read first, preserve unchanged block IDs, and pass its revision to prevent concurrent overwrite.",
      execution: {
        kind: "plugin",
        offlineAvailability: "supported",
        operation: "update_document",
        risk: "write",
        scope: "workspace:write",
      },
      inputSchema: richTextUpdateDocumentInputSchema,
      name: "rich_text_update_document",
      outputSchema: richTextDocumentOutputSchema,
    },
    {
      description:
        "Preview moving one known Rich Text document to Trash. Returned previewToken is required by rich_text_delete_document and expires quickly.",
      execution: {
        input: {
          expectedResourceTypeId: { value: RICH_TEXT_PLUGIN_ID },
          resourceId: { from: "documentResourceId" },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "preview_delete_resource",
      },
      inputSchema: z.object({
        documentResourceId,
        workspaceId,
        organizationId,
      }),
      name: "rich_text_preview_delete_document",
    },
    {
      description:
        "Move one Rich Text document to Trash for 30 days using a fresh previewToken. Reuse the idempotency key only when retrying the identical operation.",
      execution: {
        input: {
          expectedResourceTypeId: { value: RICH_TEXT_PLUGIN_ID },
          idempotencyKey: { from: "idempotencyKey" },
          resourceId: { from: "documentResourceId" },
          previewToken: { from: "previewToken" },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "delete_resource",
      },
      inputSchema: z.object({
        documentResourceId,
        idempotencyKey,
        previewToken: id(
          "Fresh preview token returned by rich_text_preview_delete_document."
        ),
        workspaceId,
        organizationId,
      }),
      name: "rich_text_delete_document",
    },
  ],
});
