import { describe, expect, it } from "vitest";
import { Doc } from "yjs";
import {
  RICH_TEXT_MAX_DOCUMENT_BLOCKS,
} from "./constants";
import type { RichTextBlockInput } from "./mcp-contract";
import { richTextDocumentOutputSchema } from "./mcp-contract";
import {
  getRichTextDocument,
  replaceRichTextDocument,
  RichTextMcpInputError,
} from "./mcp-runtime";

describe("Rich Text MCP runtime", () => {
  it("normalizes and round-trips nested rich content", async () => {
    const doc = new Doc();
    const result = await replaceRichTextDocument(doc, [
      {
        id: "title",
        type: "heading",
        props: { level: 1 },
        content: "Release plan",
      },
      {
        id: "parent",
        type: "bulletListItem",
        content: [
          { type: "text", text: "Ship ", styles: {} },
          { type: "text", text: "safely", styles: { bold: true } },
          { type: "link", href: "https://example.com", content: "docs" },
        ],
        children: [
          { id: "child", type: "checkListItem", content: "Run tests" },
        ],
      },
      {
        id: "table",
        type: "table",
        content: {
          type: "tableContent",
          rows: [{ cells: ["Owner", "Status"] }],
        },
      },
      {
        id: "image",
        type: "image",
        props: { url: "https://example.com/image.png", caption: "Diagram" },
      },
    ]);

    expect(result.blocks[0]).toMatchObject({
      id: "title",
      type: "heading",
      props: { level: 1, textAlignment: "left" },
    });
    expect(result.blocks[1]?.children[0]).toMatchObject({
      id: "child",
      type: "checkListItem",
      props: { checked: false },
    });
    expect(result.markdown).toContain("# Release plan");
    expect(
      richTextDocumentOutputSchema.safeParse({
        documentResourceId: "item-1",
        ...result,
        revision: "revision-1",
      }).success,
    ).toBe(true);
    await expect(getRichTextDocument(doc)).resolves.toEqual(result);
    doc.destroy();
  });

  it("replaces content in one Yjs transaction and preserves requested IDs", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      { id: "same", type: "paragraph", content: "Before" },
    ]);
    let transactions = 0;
    doc.on("afterTransaction", () => {
      transactions += 1;
    });

    const result = await replaceRichTextDocument(doc, [
      { id: "same", type: "paragraph", content: "After" },
      { id: "new", type: "quote", content: "New block" },
    ]);

    expect(transactions).toBe(1);
    expect(result.blocks.map(({ id }) => id)).toEqual(["same", "new"]);
    expect(result.markdown).toContain("After");
    doc.destroy();
  });

  it("rejects duplicate IDs without changing the document", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      { id: "existing", type: "paragraph", content: "Keep me" },
    ]);

    await expect(
      replaceRichTextDocument(doc, [
        {
          id: "same",
          type: "paragraph",
          children: [{ id: "same", type: "paragraph" }],
        },
      ]),
    ).rejects.toThrow("Duplicate Rich Text block ID: same");
    expect((await getRichTextDocument(doc)).markdown).toContain("Keep me");
    doc.destroy();
  });

  it("rejects unsupported blocks without changing the document", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      { id: "existing", type: "paragraph", content: "Keep me" },
    ]);

    await expect(
      replaceRichTextDocument(doc, [
        { id: "custom", type: "custom" },
      ] as unknown as RichTextBlockInput[]),
    ).rejects.toThrow(RichTextMcpInputError);
    expect((await getRichTextDocument(doc)).markdown).toContain("Keep me");
    doc.destroy();
  });

  it("checks nested block count before changing the document", async () => {
    const doc = new Doc();
    const blocks = Array.from(
      { length: RICH_TEXT_MAX_DOCUMENT_BLOCKS + 1 },
      (_, index) => ({ id: `block-${index}`, type: "paragraph" as const }),
    );

    await expect(replaceRichTextDocument(doc, blocks)).rejects.toThrow(
      `Rich Text document exceeds ${RICH_TEXT_MAX_DOCUMENT_BLOCKS} block limit`,
    );
    expect((await getRichTextDocument(doc)).blocks).toEqual([]);
    doc.destroy();
  });

  it("checks document size before changing the document", async () => {
    const doc = new Doc();

    await expect(
      replaceRichTextDocument(doc, [
        {
          id: "oversized",
          type: "paragraph",
          content: "x".repeat(5 * 1024 * 1024),
        },
      ]),
    ).rejects.toThrow("Rich Text document exceeds 5 MiB size limit");
    expect((await getRichTextDocument(doc)).blocks).toEqual([]);
    doc.destroy();
  });
});
