import { Font } from "@react-pdf/renderer";
import type {
  CodeSection,
  ColumnsSection,
  DividerSection,
  ExtensionSection,
  GroupSection,
  HeadingSection,
  ImageSection,
  KeyValueSection,
  ListSection,
  ParagraphSection,
  SpacerSection,
  TableSection,
  PdfContent,
} from "./content";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PDF_THEME } from "./theme";

// Mock @react-pdf/renderer with simple element factories
vi.mock("@react-pdf/renderer", () => {
  const { createElement } = require("react");

  const makeComponent = (name: string) => {
    const Component = (props: Record<string, unknown>) =>
      createElement(name, props);
    Component.displayName = name;
    return Component;
  };

  return {
    Document: makeComponent("Document"),
    Page: makeComponent("Page"),
    View: makeComponent("View"),
    Text: makeComponent("Text"),
    Image: makeComponent("Image"),
    Link: makeComponent("Link"),
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T) => styles,
    },
    Font: {
      registerEmojiSource: vi.fn(),
    },
    pdf: vi.fn().mockReturnValue({
      toBlob: vi.fn().mockResolvedValue(new Blob(["fake-pdf"])),
    }),
  };
});

// Mock document.createElement and URL for download logic
const mockClick = vi.fn();
vi.stubGlobal("document", {
  createElement: vi.fn().mockReturnValue({
    click: mockClick,
    href: "",
    download: "",
  }),
});
const NativeURL = URL;
vi.stubGlobal(
  "URL",
  class MockURL extends NativeURL {
    static createObjectURL = vi.fn().mockReturnValue("blob:fake");
    static revokeObjectURL = vi.fn();
  }
);

import { renderPdf as generatePdf } from "./renderer";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContent(
  sections: PdfContent["sections"],
  title = "Test"
): PdfContent[] {
  return [{ title, sections }];
}

// ─── generatePdf basic ─────────────────────────────────────────────────────

describe("generatePdf", () => {
  it("returns error for empty contents", async () => {
    const result = await generatePdf([], "test");
    expect(result).toEqual({
      success: false,
      error: "No content to compile",
    });
  });

  it("succeeds with valid content", async () => {
    const result = await generatePdf(
      makeContent([{ type: "paragraph", text: "Hello" }]),
      "test-workspace"
    );
    expect(result.success).toBe(true);
    expect(Font.registerEmojiSource).toHaveBeenCalledWith({
      builder: expect.any(Function),
      withVariationSelectors: true,
    });
  });

  it("generates correct filename", async () => {
    const result = await generatePdf(
      makeContent([{ type: "paragraph", text: "Hi" }]),
      "My Workspace!"
    );
    expect(result.filename).toBe("my-workspace-export.pdf");
  });

  it("falls back to 'export' for empty workspace name", async () => {
    const result = await generatePdf(
      makeContent([{ type: "paragraph", text: "Hi" }]),
      "!!!"
    );
    expect(result.filename).toBe("export-export.pdf");
  });
});

// ─── Legacy section types ───────────────────────────────────────────────────

describe("heading section", () => {
  it.each([1, 2, 3] as const)("renders level %i heading", async (level) => {
    const section: HeadingSection = {
      type: "heading",
      level,
      text: `Heading ${level}`,
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("paragraph section", () => {
  it("renders text", async () => {
    const section: ParagraphSection = {
      type: "paragraph",
      text: "Hello world",
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("skips empty paragraphs", async () => {
    const section: ParagraphSection = { type: "paragraph", text: "   " };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("image section", () => {
  it("renders image with dataUrl", async () => {
    const section: ImageSection = {
      type: "image",
      dataUrl: "data:image/png;base64,abc",
      width: 100,
      height: 50,
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

// ─── BlockNote section ──────────────────────────────────────────────────────

describe("blocknote section", () => {
  it("renders heading blocks", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "1",
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: "Title", styles: {} }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders paragraph blocks", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "2",
          type: "paragraph",
          content: [{ type: "text", text: "Body text", styles: {} }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders native entity references as readable mentions", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "entity-reference",
          type: "paragraph",
          content: [
            {
              type: "entityReference",
              props: { name: "Launch plan" },
            },
          ],
        },
      ],
    };

    const result = await generatePdf(makeContent([section]), "test");

    expect(result.success).toBe(true);
  });

  it("skips empty paragraph blocks", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "3",
          type: "paragraph",
          content: [{ type: "text", text: "", styles: {} }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders bullet list items", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "4",
          type: "bulletListItem",
          content: [{ type: "text", text: "Item 1", styles: {} }],
          children: [],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders numbered list items with counters", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "5",
          type: "numberedListItem",
          content: [{ type: "text", text: "First", styles: {} }],
          children: [],
        },
        {
          id: "6",
          type: "numberedListItem",
          content: [{ type: "text", text: "Second", styles: {} }],
          children: [],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("resets numbering when block type changes", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "7",
          type: "numberedListItem",
          content: [{ type: "text", text: "One", styles: {} }],
          children: [],
        },
        {
          id: "8",
          type: "paragraph",
          content: [{ type: "text", text: "Break", styles: {} }],
        },
        {
          id: "9",
          type: "numberedListItem",
          content: [{ type: "text", text: "Restarted", styles: {} }],
          children: [],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders checkbox list items", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "10",
          type: "checkListItem",
          props: { checked: true },
          content: [{ type: "text", text: "Done", styles: {} }],
          children: [],
        },
        {
          id: "11",
          type: "checkListItem",
          props: { checked: false },
          content: [{ type: "text", text: "Pending", styles: {} }],
          children: [],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders code blocks", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "12",
          type: "codeBlock",
          content: [{ type: "text", text: 'console.log("hi")', styles: {} }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders image blocks with caption", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "13",
          type: "image",
          props: { url: "https://example.com/img.png", caption: "A photo" },
          content: [],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("skips image blocks without url", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [{ id: "14", type: "image", props: {}, content: [] }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders table blocks", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "15",
          type: "table",
          content: {
            rows: [
              {
                cells: [
                  [{ type: "text", text: "A", styles: {} }],
                  [{ type: "text", text: "B", styles: {} }],
                ],
              },
            ],
          },
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders BlockNote table cell objects", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "15-cell-objects",
          type: "table",
          content: {
            rows: [
              {
                cells: [
                  {
                    type: "tableCell",
                    props: {
                      backgroundColor: "default",
                      textAlignment: "left",
                      textColor: "default",
                    },
                    content: [
                      { type: "text", text: "Cell content", styles: {} },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders inline formatting (bold, italic, links)", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "16",
          type: "paragraph",
          content: [
            { type: "text", text: "bold", styles: { bold: true } },
            { type: "text", text: "italic", styles: { italic: true } },
            {
              type: "text",
              text: "both",
              styles: { bold: true, italic: true },
            },
            { type: "text", text: "code", styles: { code: true } },
            {
              type: "text",
              text: "strike+underline",
              styles: { strike: true, underline: true },
            },
            {
              type: "text",
              text: "colored",
              styles: { textColor: "red", backgroundColor: "yellow" },
            },
            {
              type: "link",
              text: "click me",
              href: "https://example.com",
              styles: {},
            },
          ],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("falls back to plain text for unknown block types", async () => {
    const section: ExtensionSection = {
      type: "extension",
      kind: "blocknote",
      data: [
        {
          id: "17",
          type: "unknownBlock",
          content: [{ type: "text", text: "fallback", styles: {} }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

// ─── New section types ──────────────────────────────────────────────────────

describe("divider section", () => {
  it.each(["solid", "dashed", "dotted"] as const)(
    "renders %s divider",
    async (style) => {
      const section: DividerSection = { type: "divider", style };
      const result = await generatePdf(makeContent([section]), "test");
      expect(result.success).toBe(true);
    }
  );

  it("defaults to solid style", async () => {
    const section: DividerSection = { type: "divider" };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("table section", () => {
  it("renders table with headers and rows", async () => {
    const section: TableSection = {
      type: "table",
      headers: ["Name", "Age"],
      rows: [
        ["Alice", "30"],
        ["Bob", "25"],
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders table without headers", async () => {
    const section: TableSection = {
      type: "table",
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders table with column widths", async () => {
    const section: TableSection = {
      type: "table",
      headers: ["Name", "Description"],
      rows: [["Item", "A long description"]],
      columnWidths: [1, 3],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders empty table (no rows)", async () => {
    const section: TableSection = {
      type: "table",
      headers: ["Col 1", "Col 2"],
      rows: [],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("list section", () => {
  it("renders bullet list", async () => {
    const section: ListSection = {
      type: "list",
      style: "bullet",
      items: [{ text: "Item 1" }, { text: "Item 2" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders numbered list", async () => {
    const section: ListSection = {
      type: "list",
      style: "numbered",
      items: [{ text: "First" }, { text: "Second" }, { text: "Third" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders checkbox list", async () => {
    const section: ListSection = {
      type: "list",
      style: "checkbox",
      items: [
        { text: "Done", checked: true },
        { text: "Not done", checked: false },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders nested list items", async () => {
    const section: ListSection = {
      type: "list",
      style: "bullet",
      items: [
        {
          text: "Parent",
          children: [
            { text: "Child 1" },
            {
              text: "Child 2",
              children: [{ text: "Grandchild" }],
            },
          ],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("key-value section", () => {
  const entries = [
    { key: "Name", value: "Alice" },
    { key: "Age", value: "30" },
  ];

  it("renders inline layout (default)", async () => {
    const section: KeyValueSection = {
      type: "key-value",
      entries,
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders stacked layout", async () => {
    const section: KeyValueSection = {
      type: "key-value",
      entries,
      layout: "stacked",
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders table layout", async () => {
    const section: KeyValueSection = {
      type: "key-value",
      entries,
      layout: "table",
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders empty entries", async () => {
    const section: KeyValueSection = {
      type: "key-value",
      entries: [],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("code section", () => {
  it("renders code block", async () => {
    const section: CodeSection = {
      type: "code",
      code: 'function hello() {\n  return "world";\n}',
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders code block with language", async () => {
    const section: CodeSection = {
      type: "code",
      code: "const x = 1;",
      language: "typescript",
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("group section", () => {
  it("renders group with title", async () => {
    const section: GroupSection = {
      type: "group",
      title: "Stats",
      sections: [{ type: "paragraph", text: "Content inside group" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders group without title", async () => {
    const section: GroupSection = {
      type: "group",
      sections: [{ type: "paragraph", text: "No title" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders group with border", async () => {
    const section: GroupSection = {
      type: "group",
      title: "Bordered",
      border: true,
      sections: [{ type: "paragraph", text: "Bordered content" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders group with background color", async () => {
    const section: GroupSection = {
      type: "group",
      backgroundColor: "#f0f0f0",
      sections: [{ type: "paragraph", text: "Colored background" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders group with border and background", async () => {
    const section: GroupSection = {
      type: "group",
      border: true,
      backgroundColor: "#e0e0e0",
      sections: [{ type: "paragraph", text: "Both" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders nested groups", async () => {
    const section: GroupSection = {
      type: "group",
      title: "Outer",
      border: true,
      sections: [
        {
          type: "group",
          title: "Inner",
          sections: [{ type: "paragraph", text: "Deep content" }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("columns section", () => {
  it("renders two-column layout", async () => {
    const section: ColumnsSection = {
      type: "columns",
      left: [{ type: "paragraph", text: "Left side" }],
      right: [{ type: "paragraph", text: "Right side" }],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders with custom ratio", async () => {
    const section: ColumnsSection = {
      type: "columns",
      left: [{ type: "paragraph", text: "Wide" }],
      right: [{ type: "paragraph", text: "Narrow" }],
      ratio: [3, 1],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders columns with mixed content types", async () => {
    const section: ColumnsSection = {
      type: "columns",
      left: [
        { type: "heading", level: 2, text: "Stats" },
        {
          type: "key-value",
          entries: [
            { key: "HP", value: "100" },
            { key: "MP", value: "50" },
          ],
        },
      ],
      right: [
        { type: "heading", level: 2, text: "Equipment" },
        {
          type: "list",
          style: "bullet",
          items: [{ text: "Sword" }, { text: "Shield" }],
        },
      ],
    };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

describe("spacer section", () => {
  it("renders spacer with default height", async () => {
    const section: SpacerSection = { type: "spacer" };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });

  it("renders spacer with custom height", async () => {
    const section: SpacerSection = { type: "spacer", height: 20 };
    const result = await generatePdf(makeContent([section]), "test");
    expect(result.success).toBe(true);
  });
});

// ─── Max depth guard ────────────────────────────────────────────────────────

describe("max depth guard", () => {
  it("stops rendering at depth > 5", async () => {
    // Build nested groups 7 levels deep
    let innermost: GroupSection = {
      type: "group",
      title: "Level 7",
      sections: [{ type: "paragraph", text: "Too deep" }],
    };
    for (let i = 6; i >= 1; i--) {
      innermost = {
        type: "group",
        title: `Level ${i}`,
        sections: [innermost],
      };
    }
    const result = await generatePdf(makeContent([innermost]), "test");
    expect(result.success).toBe(true);
  });
});

// ─── Mixed content ──────────────────────────────────────────────────────────

describe("mixed section types", () => {
  it("renders a document with old and new section types", async () => {
    const sections: PdfContent["sections"] = [
      { type: "heading", level: 1, text: "Character Sheet" },
      { type: "divider" },
      {
        type: "columns",
        left: [
          {
            type: "key-value",
            entries: [
              { key: "Name", value: "Aragorn" },
              { key: "Race", value: "Human" },
            ],
          },
        ],
        right: [
          {
            type: "table",
            headers: ["Stat", "Value"],
            rows: [
              ["STR", "18"],
              ["DEX", "14"],
            ],
          },
        ],
      },
      { type: "spacer", height: 10 },
      {
        type: "group",
        title: "Equipment",
        border: true,
        sections: [
          {
            type: "list",
            style: "bullet",
            items: [{ text: "Anduril" }, { text: "Mithril Vest" }],
          },
        ],
      },
      { type: "paragraph", text: "End of sheet." },
    ];
    const result = await generatePdf(makeContent(sections), "test");
    expect(result.success).toBe(true);
  });

  it("renders no-content label when sections are empty", async () => {
    const result = await generatePdf(
      [{ title: "Empty", sections: [] }],
      "test"
    );
    expect(result.success).toBe(true);
  });

  it("renders document without title", async () => {
    const result = await generatePdf(
      [{ title: "", sections: [{ type: "paragraph", text: "No title doc" }] }],
      "test"
    );
    expect(result.success).toBe(true);
  });
});

// ─── Theme usage ────────────────────────────────────────────────────────────

describe("theme", () => {
  it("uses custom theme", async () => {
    const customTheme = {
      ...DEFAULT_PDF_THEME,
      fontSize: { ...DEFAULT_PDF_THEME.fontSize, body: 14 },
    };
    const result = await generatePdf(
      makeContent([{ type: "paragraph", text: "Large text" }]),
      "test",
      customTheme
    );
    expect(result.success).toBe(true);
  });

  it("uses default theme when not specified", async () => {
    const result = await generatePdf(
      makeContent([{ type: "paragraph", text: "Default" }]),
      "test"
    );
    expect(result.success).toBe(true);
  });
});
