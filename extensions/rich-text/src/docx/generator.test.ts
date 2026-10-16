import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RichTextBlock } from "../blocknote-types";
import { richTextHeadlessSchema } from "../entity-reference-schema";
import { generateDocx } from "./generator";
import { loadDocxImage } from "./images";

vi.mock("./images", () => ({ loadDocxImage: vi.fn() }));
type Schema = typeof richTextHeadlessSchema;
type InputBlock = PartialBlock<
  Schema["blockSchema"],
  Schema["inlineContentSchema"],
  Schema["styleSchema"]
>;
const labels = { missingImage: "Image unavailable" };
function blocks(input: InputBlock[]): RichTextBlock[] {
  const editor = BlockNoteEditor.create({
    schema: richTextHeadlessSchema,
    initialContent: input,
  });
  try {
    return editor.document;
  } finally {
    editor._tiptapEditor.destroy();
  }
}
async function unpack(input: RichTextBlock[], title = "Résumé 世界") {
  const result = await generateDocx(input, title, labels);
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const file = zip.file("word/document.xml");
  if (!file) {
    throw new Error("Missing document.xml");
  }
  const xml = await file.async("string");
  return { ...result, zip, xml };
}
afterEach(() => vi.resetAllMocks());

describe("DOCX content", () => {
  it("preserves rich text, hyperlinks, mentions, line breaks and metadata", async () => {
    const { blob, zip, xml } = await unpack(
      blocks([
        {
          type: "heading",
          props: { level: 2, textAlignment: "center" },
          content: "Heading",
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Résumé 世界\nNext line",
              styles: {
                bold: true,
                italic: true,
                underline: true,
                strike: true,
                code: true,
                textColor: "red",
                backgroundColor: "#abc",
              },
            },
            {
              type: "link",
              href: "https://example.com/a?b=1&c=2",
              content: [
                { type: "text", text: "Linked", styles: { bold: true } },
              ],
            },
            {
              type: "entityReference",
              props: {
                name: "Referenced resource",
                resourceId: "r-1",
                workspaceId: "w-1",
                kind: "resource",
              },
            },
          ],
        },
        { type: "paragraph", content: "" },
        { type: "codeBlock", content: "const x = 1;\nreturn x;" },
      ])
    );
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    for (const fragment of [
      "Heading2",
      'w:val="center"',
      "Résumé 世界",
      "Next line",
      "w:br",
      "w:b",
      "w:i",
      "w:u",
      "w:strike",
      "Courier New",
      "e03e3e",
      "aabbcc",
      "w:hyperlink",
      "Linked",
      "@Referenced resource",
      "const x = 1;",
    ]) {
      expect(xml).toContain(fragment);
    }
    expect(
      await zip.file("word/_rels/document.xml.rels")?.async("string")
    ).toContain("https://example.com/a?b=1&amp;c=2");
    expect(await zip.file("docProps/core.xml")?.async("string")).toContain(
      "Résumé 世界"
    );
    expect(xml.match(/Résumé 世界/g)).toHaveLength(1);
  });

  it("continues sibling numbering, separates nested lists, and restarts after paragraphs", async () => {
    const { zip, xml } = await unpack(
      blocks([
        {
          type: "numberedListItem",
          props: { start: 3 },
          content: "First",
          children: [{ type: "numberedListItem", content: "Nested" }],
        },
        { type: "numberedListItem", content: "Second" },
        { type: "paragraph", content: "Break" },
        { type: "numberedListItem", content: "Restart" },
        {
          type: "bulletListItem",
          content: "Bullet",
          children: [
            {
              type: "checkListItem",
              props: { checked: true },
              content: "Done",
            },
          ],
        },
      ])
    );
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = [...parsed.getElementsByTagName("w:p")];
    const numId = (text: string) =>
      paragraphs
        .find((p) => p.textContent?.includes(text))
        ?.getElementsByTagName("w:numId")[0]
        ?.getAttribute("w:val");
    expect(numId("First")).toBeTruthy();
    expect(numId("First")).toBe(numId("Second"));
    expect(numId("Nested")).not.toBe(numId("First"));
    expect(numId("Restart")).not.toBe(numId("First"));
    expect(xml).toContain("☑");
    expect(await zip.file("word/numbering.xml")?.async("string")).toContain(
      'w:start w:val="3"'
    );
  });

  it("exports table headers, spans and styled cells", async () => {
    // Use a persisted table shape: editor normalization may rewrite merged cells.
    const input = blocks([
      {
        type: "table",
        content: {
          type: "tableContent",
          columnWidths: [120, 120],
          headerRows: 1,
          rows: [
            {
              cells: [
                [{ type: "text", text: "Header", styles: { bold: true } }],
                [],
              ],
            },
            { cells: [[], []] },
          ],
        },
      },
    ]);
    const block = input[0];
    if (block?.type !== "table") {
      throw new Error("Table fixture missing");
    }
    block.content.headerRows = 1;
    block.content.rows = [
      {
        cells: [
          {
            type: "tableCell",
            props: {
              colspan: 2,
              rowspan: 2,
              backgroundColor: "blue",
              textColor: "red",
              textAlignment: "right",
            },
            content: [
              { type: "text", text: "Merged", styles: { italic: true } },
            ],
          },
        ],
      },
      { cells: [] },
    ];
    const { xml } = await unpack(input);
    for (const fragment of [
      "w:tbl",
      "w:tblHeader",
      'w:gridSpan w:val="2"',
      'w:vMerge w:val="restart"',
      "Merged",
      "w:b",
      "w:i",
      'w:val="right"',
      "ddebf1",
      "e03e3e",
    ]) {
      expect(xml).toContain(fragment);
    }
  });

  it("keeps header-column styling aligned after rowspans", async () => {
    const input = blocks([
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [{ cells: [[], [], []] }],
        },
      },
    ]);
    const block = input[0];
    if (block?.type !== "table") {
      throw new Error("Table fixture missing");
    }
    const cell = (text: string, colspan = 1, rowspan = 1) => ({
      type: "tableCell" as const,
      props: {
        colspan,
        rowspan,
        backgroundColor: "default",
        textColor: "default",
        textAlignment: "left" as const,
      },
      content: [{ type: "text" as const, text, styles: {} }],
    });
    block.content.headerCols = 2;
    block.content.rows = [
      { cells: [cell("Header", 2, 2), cell("Body one")] },
      { cells: [cell("Body two")] },
      { cells: [cell("Header again", 2), cell("Body three")] },
    ];
    const { xml } = await unpack(input);
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = [...parsed.getElementsByTagName("w:p")];
    const bold = (text: string) =>
      paragraphs
        .find((p) => p.textContent === text)
        ?.getElementsByTagName("w:b")[0]
        ?.getAttribute("w:val") !== "false";
    expect(bold("Header")).toBe(true);
    expect(bold("Header again")).toBe(true);
    expect(bold("Body two")).toBe(false);
  });

  it("embeds images with alt text, captions, and preserves child blocks", async () => {
    vi.mocked(loadDocxImage).mockResolvedValue({
      data: Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII="
        ),
        (c) => c.charCodeAt(0)
      ),
      type: "png",
      transformation: { width: 100, height: 50 },
    });
    const { xml, zip, missingImages } = await unpack(
      blocks([
        {
          type: "image",
          props: {
            url: "https://example.com/image.png",
            name: "Diagram",
            caption: "Caption",
            previewWidth: 100,
          },
          children: [{ type: "paragraph", content: "Image child" }],
        },
      ])
    );
    expect(missingImages).toBe(0);
    expect(
      Object.keys(zip.files).some(
        (path) => path.startsWith("word/media/") && path.endsWith(".png")
      )
    ).toBe(true);
    for (const text of [
      "Diagram",
      "Caption",
      "Image child",
      'cx="952500"',
      'cy="476250"',
    ]) {
      expect(xml).toContain(text);
    }
  });

  it("keeps remaining content when image loading fails", async () => {
    vi.mocked(loadDocxImage).mockRejectedValue(new Error("offline"));
    const { xml, missingImages } = await unpack(
      blocks([
        {
          type: "image",
          props: { url: "https://example.com/missing.png", name: "Diagram" },
        },
        { type: "paragraph", content: "Still here" },
        {
          type: "file",
          props: { url: "https://example.com/file", name: "Attachment" },
        },
      ])
    );
    expect(missingImages).toBe(1);
    for (const text of [
      "Image unavailable: Diagram",
      "Still here",
      "Attachment",
      "w:hyperlink",
    ]) {
      expect(xml).toContain(text);
    }
  });

  it("creates a valid blank DOCX", async () => {
    const { xml, zip } = await unpack([]);
    expect(xml).toContain("w:body");
    expect(xml).toContain("w:p");
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
  });
});
