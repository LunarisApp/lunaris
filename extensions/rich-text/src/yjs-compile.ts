import { BlockNoteEditor } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import type {
  JsonValue,
  PluginResourceReadContext,
} from "@lunarisapp/plugin-sdk";
import { withYjsDoc } from "@lunarisapp/plugin-sdk/data";
import type { Doc } from "yjs";
import { richTextHeadlessSchema } from "./entity-reference-schema";
import type { RichTextBlock } from "./blocknote-types";
import type { PdfContent } from "./pdf/content";

export function extractBlockNoteBlocks(doc: Doc): RichTextBlock[] {
  const fragment = doc.getXmlFragment();
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });
  try {
    return yXmlFragmentToBlocks(editor, fragment);
  } finally {
    editor._tiptapEditor?.destroy();
  }
}

export function extractBlockNoteMarkdown(doc: Doc): string {
  const fragment = doc.getXmlFragment();
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });
  try {
    const blocks = yXmlFragmentToBlocks(editor, fragment);
    return editor.blocksToMarkdownLossy(blocks);
  } finally {
    editor._tiptapEditor?.destroy();
  }
}

export async function compileBlockNoteDocument(
  context: PluginResourceReadContext,
  resourceId: string
): Promise<PdfContent> {
  const resource = await context.getWorkspaceResource(resourceId);
  const content = resource?.storage.content;
  if (content?.kind !== "yjs") {
    return { title: "", sections: [] };
  }
  return withYjsDoc(
    context,
    content,
    (doc) => ({
      title: "",
      sections: [
        {
          type: "extension",
          kind: "blocknote",
          data: extractBlockNoteBlocks(doc) as JsonValue,
        },
      ],
    }),
    { title: "", sections: [] }
  );
}

export async function compileBlockNoteMarkdown(
  context: PluginResourceReadContext,
  resourceId: string
): Promise<string> {
  const resource = await context.getWorkspaceResource(resourceId);
  const content = resource?.storage.content;
  if (content?.kind !== "yjs") {
    return "";
  }
  return withYjsDoc(context, content, extractBlockNoteMarkdown, "");
}

export async function compileBlockNoteBlocks(
  context: PluginResourceReadContext,
  resourceId: string
): Promise<RichTextBlock[]> {
  const resource = await context.getWorkspaceResource(resourceId);
  const content = resource?.storage.content;
  if (content?.kind !== "yjs") {
    return [];
  }
  return withYjsDoc(context, content, extractBlockNoteBlocks, []);
}
