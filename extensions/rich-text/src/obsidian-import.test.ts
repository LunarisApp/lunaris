/** @vitest-environment happy-dom */
import { BlockNoteEditor } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Doc } from "yjs";
import {
  createObsidianMarkdownConverter,
  readObsidianProperties,
  type ResolveImportReference,
} from "./obsidian-import";
import { richTextHeadlessSchema } from "./entity-reference-schema";

const converters: ReturnType<typeof createObsidianMarkdownConverter>[] = [];
afterEach(() => {
  for (const converter of converters) {
    converter.destroy();
  }
  converters.length = 0;
});
function convert(
  source: string,
  resolve: ResolveImportReference = () => ({
    reference: {
      resourceId: "res_note",
      workspaceId: "workspace_1",
      name: "Note",
    },
  })
) {
  const converter = createObsidianMarkdownConverter();
  converters.push(converter);
  const result = converter.convert(source, resolve);
  const doc = new Doc();
  result.initialize(doc);
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });
  const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment());
  editor._tiptapEditor.destroy();
  doc.destroy();
  return { ...result, blocks, json: JSON.stringify(blocks) };
}
describe("Obsidian Markdown conversion", () => {
  it("preserves wikilinks, Markdown links, reference links and links in tables through Yjs", () => {
    const resolve = vi.fn<ResolveImportReference>(() => ({
      reference: {
        resourceId: "res_note",
        workspaceId: "workspace_1",
        name: "Note",
      },
    }));
    const result = convert(
      "# Heading\n\n[[Note|Alias]] and [relative](../Note.md) and [ref][n]\n\n[n]: Note.md\n\n| Link |\n| --- |\n| [[Note]] |",
      resolve
    );
    expect(result.blocks[0]?.type).toBe("heading");
    expect(result.json.match(/"type":"entityReference"/g)).toHaveLength(4);
    expect(result.json).toContain('"name":"Alias"');
    expect(result.json).not.toContain("lunaris-import.invalid");
    expect(resolve).toHaveBeenCalledWith("../Note.md", false);
  });
  it("does not rewrite code, inline code, or external URLs", () => {
    const resolve = vi.fn<ResolveImportReference>(() => ({}));
    const result = convert(
      "`[[Note]]`\n\n```md\n[[Note]]\n```\n\n[external](https://example.com)",
      resolve
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(result.json).toContain("[[Note]]");
    expect(result.json).toContain("https://example.com");
  });
  it("preserves formatted link labels and external reference-style links", () => {
    const result = convert(
      "[Read **important** _notes_](Note.md) and [the docs][docs]\n\n[docs]: https://example.com/docs"
    );
    expect(result.json).toContain('"name":"Read important notes"');
    expect(result.json).toContain('"href":"https://example.com/docs"');
    expect(result.json).not.toContain("[docs]");
  });
  it("reports footnotes whose navigation cannot transfer", () => {
    const result = convert(
      "A claim[^source].\n\n[^source]: Supporting evidence."
    );
    expect(result.warnings).toContain("unsupported-syntax");
    expect(result.json).toContain("Supporting evidence.");
  });
  it("stores image embeds using persistent storage handles and bounded widths", () => {
    const result = convert(
      "![[photo.jpeg|240x120]] ![Photo](photo.jpeg)",
      () => ({
        reference: {
          resourceId: "res_image",
          workspaceId: "workspace_1",
          name: "photo.jpeg",
          image: true,
          storageId: "storage_image",
        },
      })
    );
    expect(result.json).toContain('"embed":true');
    expect(result.json).toContain('"storageId":"storage_image"');
    expect(result.json).toContain('"width":240');
    expect(result.json).not.toContain("blob:");
  });
  it("reports anchors, note transclusions, ambiguous and unresolved links", () => {
    const result = convert(
      "![[Note#Heading]] [[Missing]] [[Duplicate]]",
      (target) =>
        target === "Missing"
          ? {}
          : target === "Duplicate"
            ? { warning: "ambiguous-link" }
            : {
                reference: {
                  resourceId: "res_note",
                  workspaceId: "workspace_1",
                  name: "Note",
                },
              }
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "anchor",
        "transclusion",
        "unresolved-link",
        "ambiguous-link",
      ])
    );
    expect(result.json).toContain("[[Missing]]");
    expect(result.json).toContain("[[Duplicate]]");
  });
  it("extracts properties without rendering frontmatter as a heading", () => {
    const result = convert(
      "---\r\naliases: [Alias, Other]\r\ntags: [work, project/alpha]\r\npriority: 2\r\n---\r\n# Note"
    );
    expect(result.metadata.properties.priority).toBe(2);
    expect(result.metadata.aliases).toEqual(["Alias", "Other"]);
    expect(result.metadata.tags).toEqual(["work", "project/alpha"]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.type).toBe("heading");
  });
  it("preserves raw HTML as code without executing it", () => {
    const result = convert(
      "<div>Block content</div>\n\nText <span>inline content</span>."
    );
    expect(result.warnings).toContain("unsupported-syntax");
    expect(result.blocks[0]?.type).toBe("codeBlock");
    expect(result.json).toContain("<div>Block content</div>");
    expect(result.json).toContain("<span>");
    expect(result.json).toContain("inline content");
  });
  it("retains malformed frontmatter and reports plugin-specific syntax", () => {
    const result = convert(
      "---\ntags: [bad\n---\n> [!NOTE] Callout\n\n```dataview\nLIST\n```"
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining(["frontmatter", "unsupported-syntax"])
    );
    expect(result.json).toContain("tags: [bad");
    expect(result.json).toContain("LIST");
    expect(readObsidianProperties("---\na: &a [*a]\n---\nBody").warning).toBe(
      "frontmatter"
    );
  });
});
