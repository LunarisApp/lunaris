import { describe, expect, it } from "vitest";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import { RICH_TEXT_MAX_DOCUMENT_BLOCKS } from "./constants";
import type { RichTextBlockInput, RichTextEdit } from "./mcp-contract";
import { richTextDocumentOutputSchema } from "./mcp-contract";
import {
  getRichTextDocument,
  editRichTextDocument,
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
      }).success
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
      ])
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
      ] as unknown as RichTextBlockInput[])
    ).rejects.toThrow(RichTextMcpInputError);
    expect((await getRichTextDocument(doc)).markdown).toContain("Keep me");
    doc.destroy();
  });

  it("checks nested block count before changing the document", async () => {
    const doc = new Doc();
    const blocks = Array.from(
      { length: RICH_TEXT_MAX_DOCUMENT_BLOCKS + 1 },
      (_, index) => ({ id: `block-${index}`, type: "paragraph" as const })
    );

    await expect(replaceRichTextDocument(doc, blocks)).rejects.toThrow(
      `Rich Text document exceeds ${RICH_TEXT_MAX_DOCUMENT_BLOCKS} block limit`
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
      ])
    ).rejects.toThrow("Rich Text document exceeds 5 MiB size limit");
    expect((await getRichTextDocument(doc)).blocks).toEqual([]);
    doc.destroy();
  });
});

describe("targeted Rich Text edits", () => {
  it("updates nested content while preserving styles, props, children, and siblings", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      {
        id: "parent",
        type: "heading",
        props: { level: 2 },
        content: "Heading",
        children: [{ id: "child", type: "paragraph", content: "Before" }],
      },
      {
        id: "keep",
        type: "paragraph",
        content: [{ type: "text", text: "Styled", styles: { bold: true } }],
      },
    ]);
    const before = await getRichTextDocument(doc);
    let transactions = 0;
    doc.on("afterTransaction", () => {
      transactions += 1;
    });
    await expect(
      editRichTextDocument(doc, [
        { op: "update", blockId: "child", content: "After" },
        { op: "update", blockId: "parent", props: { level: 3 } },
      ])
    ).resolves.toEqual({ appliedEdits: 2 });
    expect(transactions).toBe(1);
    const after = await getRichTextDocument(doc);
    expect(after.blocks[1]).toEqual(before.blocks[1]);
    expect(after.blocks[0]).toMatchObject({
      id: "parent",
      props: { level: 3 },
      children: [{ id: "child" }],
    });
    expect(after.markdown).toContain("After");
    doc.destroy();
  });

  it.each([
    [
      { op: "update", blockId: "target", props: { id: "keep" } },
      "Unknown Rich Text heading property: id",
    ],
    [
      { op: "update", blockId: "target", props: { typo: "value" } },
      "Unknown Rich Text heading property: typo",
    ],
    [
      { op: "update", blockId: "target", props: { level: 10 } },
      "Invalid Rich Text heading property: level",
    ],
    [
      { op: "update", blockId: "target", props: { level: "2" } },
      "Invalid Rich Text heading property: level",
    ],
    [
      { op: "update", blockId: "target", props: { textAlignment: "sideways" } },
      "Invalid Rich Text heading property: textAlignment",
    ],
    [
      { op: "update", blockId: "target", props: { level: null } },
      "Invalid Rich Text heading property: level",
    ],
    [
      {
        op: "insert",
        parentBlockId: null,
        afterBlockId: null,
        blocks: [
          {
            id: "new",
            type: "paragraph",
            children: [
              { id: "nested", type: "heading", props: { id: "keep" } },
            ],
          },
        ],
      },
      "Unknown Rich Text heading property: id",
    ],
  ] satisfies [RichTextEdit, string][])(
    "rejects invalid properties without persisting earlier edits: %j",
    async (edit, message) => {
      const doc = new Doc();
      try {
        await replaceRichTextDocument(doc, [
          { id: "target", type: "heading", content: "Heading" },
          { id: "keep", type: "paragraph", content: "Untouched" },
        ]);
        const before = encodeStateAsUpdateV2(doc);
        await expect(
          editRichTextDocument(doc, [
            { op: "update", blockId: "keep", content: "Do not save" },
            edit,
          ])
        ).rejects.toThrow(message);
        expect(encodeStateAsUpdateV2(doc)).toEqual(before);
      } finally {
        doc.destroy();
      }
    }
  );

  it("rejects normalized duplicate IDs during full replacements", async () => {
    const doc = new Doc();
    try {
      await replaceRichTextDocument(doc, [
        { id: "keep", type: "paragraph", content: "Untouched" },
      ]);
      const before = encodeStateAsUpdateV2(doc);
      await expect(
        replaceRichTextDocument(doc, [
          { id: "target", type: "paragraph", props: { id: "keep" } },
          { id: "keep", type: "paragraph" },
        ])
      ).rejects.toThrow("Duplicate Rich Text block ID: keep");
      expect(encodeStateAsUpdateV2(doc)).toEqual(before);
    } finally {
      doc.destroy();
    }
  });

  it("inserts at root and nested sibling positions, then edits inserted blocks", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      { id: "parent", type: "paragraph", content: "Parent" },
    ]);
    await editRichTextDocument(doc, [
      {
        op: "insert",
        parentBlockId: null,
        afterBlockId: null,
        blocks: [{ id: "first", type: "paragraph" }],
      },
      {
        op: "insert",
        parentBlockId: "parent",
        afterBlockId: null,
        blocks: [{ id: "child", type: "paragraph" }],
      },
      {
        op: "insert",
        parentBlockId: "parent",
        afterBlockId: "child",
        blocks: [{ id: "last", type: "paragraph" }],
      },
      { op: "update", blockId: "last", content: "Last" },
      { op: "delete", blockId: "first" },
    ]);
    expect((await getRichTextDocument(doc)).blocks).toMatchObject([
      { id: "parent", children: [{ id: "child" }, { id: "last" }] },
    ]);
    doc.destroy();
  });

  it("rejects a later missing target without applying earlier edits", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      { id: "keep", type: "paragraph", content: "Before" },
    ]);
    const before = await getRichTextDocument(doc);
    await expect(
      editRichTextDocument(doc, [
        { op: "update", blockId: "keep", content: "After" },
        { op: "delete", blockId: "missing" },
      ])
    ).rejects.toThrow("Rich Text block not found: missing");
    expect(await getRichTextDocument(doc)).toEqual(before);
    doc.destroy();
  });

  it("rejects duplicate IDs, wrong-parent anchors, no-op updates, and deleting every block", async () => {
    const doc = new Doc();
    await replaceRichTextDocument(doc, [
      {
        id: "keep",
        type: "paragraph",
        children: [{ id: "child", type: "paragraph" }],
      },
    ]);
    const before = await getRichTextDocument(doc);
    await expect(
      editRichTextDocument(doc, [
        {
          op: "insert",
          parentBlockId: null,
          afterBlockId: null,
          blocks: [{ id: "child", type: "paragraph" }],
        },
      ])
    ).rejects.toThrow("Duplicate Rich Text block ID");
    await expect(
      editRichTextDocument(doc, [
        {
          op: "insert",
          parentBlockId: "keep",
          afterBlockId: "keep",
          blocks: [{ id: "new", type: "paragraph" }],
        },
      ])
    ).rejects.toThrow("Insertion sibling not found in parent");
    await expect(
      editRichTextDocument(doc, [{ op: "update", blockId: "keep" }])
    ).rejects.toThrow("requires content or props");
    await expect(
      editRichTextDocument(doc, [{ op: "update", blockId: "keep", props: {} }])
    ).rejects.toThrow("requires content or props");
    await expect(
      editRichTextDocument(doc, [{ op: "delete", blockId: "keep" }])
    ).rejects.toThrow("Keep at least one");
    expect(await getRichTextDocument(doc)).toEqual(before);
    doc.destroy();
  });
});
