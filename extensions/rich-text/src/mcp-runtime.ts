import { BlockNoteEditor } from "@blocknote/core";
import {
  blocksToYDoc,
  blocksToYXmlFragment,
  yXmlFragmentToBlocks,
} from "@blocknote/core/yjs";
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

function createAdapter(): RichTextRuntimeAdapter {
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });
  return {
    blocksToMarkdown: (blocks) =>
      editor.blocksToMarkdownLossy(blocks as never),
    blocksToYXmlFragment: (blocks, fragment) =>
      blocksToYXmlFragment(editor, blocks as never, fragment),
    destroy: () => editor._tiptapEditor?.destroy(),
    normalizeBlocks: (blocks) => {
      const doc = blocksToYDoc(editor, blocks as never, "");
      try {
        return yXmlFragmentToBlocks(
          editor,
          doc.getXmlFragment(),
        ) as RichTextBlockData[];
      } finally {
        doc.destroy();
      }
    },
    yXmlFragmentToBlocks: (fragment) =>
      yXmlFragmentToBlocks(editor, fragment) as RichTextBlockData[],
  };
}
