import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { getDocument } from "@blocknote/server-util/dom";
import type { RichTextBlockData } from "./mcp-contract";
import { richTextHeadlessSchema } from "./entity-reference-schema";
import {
  createRichTextRuntime,
  type RichTextRuntimeAdapter,
} from "./mcp-runtime-common";

export {
  RICH_TEXT_BLOCK_GUIDE,
  RichTextMcpInputError,
} from "./mcp-runtime-common";

export const { getRichTextDocument, replaceRichTextDocument } =
  createRichTextRuntime(createAdapter);

let serverDocument: Document | undefined;

function createAdapter(): RichTextRuntimeAdapter {
  serverDocument ??= globalThis.document ?? getDocument();
  const editor = ServerBlockNoteEditor.create(
    { schema: richTextHeadlessSchema },
    serverDocument
  );
  return {
    blocksToMarkdown: (blocks) => editor.blocksToMarkdownLossy(blocks as never),
    blocksToYXmlFragment: (blocks, fragment) =>
      editor.blocksToYXmlFragment(blocks as never, fragment),
    destroy: () => editor.editor._tiptapEditor?.destroy(),
    normalizeBlocks: (blocks) => {
      const doc = editor.blocksToYDoc(blocks as never, "");
      try {
        return editor.yXmlFragmentToBlocks(
          doc.getXmlFragment()
        ) as RichTextBlockData[];
      } finally {
        doc.destroy();
      }
    },
    yXmlFragmentToBlocks: (fragment) =>
      editor.yXmlFragmentToBlocks(fragment) as RichTextBlockData[],
  };
}
