import { describe, expect, it } from "vitest";
import { RICH_TEXT_PLUGIN_ID } from "./constants";
import { richTextMcpCapabilities } from "./mcp";

describe("Rich Text MCP capabilities", () => {
  it("owns namespaced document tools", () => {
    expect(richTextMcpCapabilities.extensionId).toBe(RICH_TEXT_PLUGIN_ID);
    expect(richTextMcpCapabilities.tools.map(({ name }) => name)).toEqual([
      "rich_text_read_me",
      "rich_text_list_documents",
      "rich_text_create_document",
      "rich_text_get_document",
      "rich_text_update_document",
      "rich_text_preview_delete_document",
      "rich_text_delete_document",
    ]);
  });

  it("declares offline reads and revision-guarded writes", () => {
    const read = richTextMcpCapabilities.tools.find(
      ({ name }) => name === "rich_text_get_document"
    );
    const update = richTextMcpCapabilities.tools.find(
      ({ name }) => name === "rich_text_update_document"
    );

    expect(read?.execution).toMatchObject({
      kind: "plugin",
      offlineAvailability: "supported",
      operation: "get_document",
      risk: "read",
      scope: "workspace:read",
    });
    expect(update?.execution).toMatchObject({
      kind: "plugin",
      offlineAvailability: "supported",
      operation: "update_document",
      risk: "write",
      scope: "workspace:write",
    });
    expect(
      update?.inputSchema.safeParse({
        blocks: [{ id: "title", type: "heading", content: "Title" }],
        documentResourceId: "item-1",
        expectedRevision: "revision-1",
        idempotencyKey: "request-1",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      }).success
    ).toBe(true);
  });

  it("fixes the resource type for lifecycle operations", () => {
    const create = richTextMcpCapabilities.tools.find(
      ({ name }) => name === "rich_text_create_document"
    );
    expect(create?.execution.kind).toBe("operation");
    if (create?.execution.kind !== "operation") {
      throw new Error("Expected delegated document creation");
    }
    expect(create.execution.input).toMatchObject({
      resourceTypeId: { value: RICH_TEXT_PLUGIN_ID },
    });

    for (const tool of richTextMcpCapabilities.tools.filter(({ name }) =>
      name.includes("delete_document")
    )) {
      if (tool.execution.kind !== "operation") {
        throw new Error("Expected delegated document deletion");
      }
      expect(tool.execution.input).toMatchObject({
        expectedResourceTypeId: { value: RICH_TEXT_PLUGIN_ID },
      });
    }
  });
});
