import {
  RICH_TEXT_MAX_DOCUMENT_BLOCKS,
  RICH_TEXT_MAX_DOCUMENT_BYTES,
} from "./constants";
import type { RichTextBlockData, RichTextBlockInput } from "./mcp-contract";
import type { Doc, XmlFragment } from "yjs";

export interface RichTextRuntimeAdapter {
  blocksToMarkdown(
    blocks: readonly RichTextBlockData[]
  ): Promise<string> | string;
  blocksToYXmlFragment(
    blocks: readonly RichTextBlockData[],
    fragment: XmlFragment
  ): XmlFragment;
  destroy(): void;
  normalizeBlocks(blocks: readonly RichTextBlockInput[]): RichTextBlockData[];
  yXmlFragmentToBlocks(fragment: XmlFragment): RichTextBlockData[];
}

export const RICH_TEXT_BLOCK_GUIDE = `# Rich Text BlockNote document format

Call rich_text_get_document before editing. Send the complete replacement block tree to rich_text_update_document and preserve IDs for unchanged blocks. Every block needs a stable unique ID across the entire nested tree.

Common blocks:
- Paragraph: {"id":"intro","type":"paragraph","content":"Hello world"}
- Heading: {"id":"title","type":"heading","props":{"level":1},"content":"Title"}
- Styled text: {"id":"important","type":"paragraph","content":[{"type":"text","text":"Important","styles":{"bold":true}}]}
- Link: {"id":"link","type":"paragraph","content":[{"type":"link","href":"https://example.com","content":"Example"}]}
- List item with children: {"id":"item","type":"bulletListItem","content":"Parent","children":[{"id":"child","type":"bulletListItem","content":"Child"}]}

Supported types: paragraph, heading, quote, bulletListItem, numberedListItem, checkListItem, toggleListItem, codeBlock, table, divider, file, image, video, and audio. BlockNote fills omitted props and converts string content to inline text. Markdown in read responses is a lossy convenience only; write native blocks. Keep the normalized document under 5 MiB and ${RICH_TEXT_MAX_DOCUMENT_BLOCKS} total nested blocks.`;

export class RichTextMcpInputError extends Error {
  readonly code = "INVALID_RICH_TEXT_DOCUMENT";
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "RichTextMcpInputError";
  }
}

export function createRichTextRuntime(
  createAdapter: () => RichTextRuntimeAdapter
) {
  return {
    getRichTextDocument: (doc: Doc) =>
      withAdapter(createAdapter, async (adapter) => {
        const blocks = adapter.yXmlFragmentToBlocks(doc.getXmlFragment());
        return {
          blocks: cloneRichTextBlocks(blocks),
          markdown: await adapter.blocksToMarkdown(blocks),
        };
      }),
    replaceRichTextDocument: async (
      doc: Doc,
      requested: readonly RichTextBlockInput[]
    ) => {
      assertRichTextDocumentInput(requested);
      return withAdapter(createAdapter, async (adapter) => {
        try {
          const blocks = adapter.normalizeBlocks(structuredClone(requested));
          assertRichTextDocumentLimits(blocks);
          const markdown = await adapter.blocksToMarkdown(blocks);
          adapter.blocksToYXmlFragment(blocks, doc.getXmlFragment());
          return { blocks: cloneRichTextBlocks(blocks), markdown };
        } catch (error) {
          if (error instanceof RichTextMcpInputError) {
            throw error;
          }
          throw new RichTextMcpInputError(
            error instanceof Error
              ? error.message
              : "Invalid BlockNote document"
          );
        }
      });
    },
  };
}

async function withAdapter<T>(
  createAdapter: () => RichTextRuntimeAdapter,
  run: (adapter: RichTextRuntimeAdapter) => Promise<T>
): Promise<T> {
  const adapter = createAdapter();
  try {
    return await run(adapter);
  } finally {
    adapter.destroy();
  }
}

function cloneRichTextBlocks(
  blocks: readonly RichTextBlockData[]
): RichTextBlockData[] {
  return JSON.parse(JSON.stringify(blocks)) as RichTextBlockData[];
}

function assertRichTextDocumentInput(
  blocks: readonly RichTextBlockInput[]
): void {
  assertBlockCount(blocks);
  assertSerializedSize(blocks);
  assertUniqueBlockIds(blocks);
}

function assertRichTextDocumentLimits(
  blocks: readonly RichTextBlockData[]
): void {
  assertBlockCount(blocks);
  assertSerializedSize(blocks);
}

function assertBlockCount(
  blocks: readonly { children?: readonly unknown[] }[]
): void {
  let count = 0;
  const pending: unknown[] = [...blocks];
  while (pending.length > 0) {
    const block = pending.pop();
    if (!block || typeof block !== "object") {
      continue;
    }
    count += 1;
    if (count > RICH_TEXT_MAX_DOCUMENT_BLOCKS) {
      throw new RichTextMcpInputError(
        `Rich Text document exceeds ${RICH_TEXT_MAX_DOCUMENT_BLOCKS} block limit`
      );
    }
    const children = (block as { children?: unknown }).children;
    if (Array.isArray(children)) {
      pending.push(...children);
    }
  }
}

function assertSerializedSize(value: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > RICH_TEXT_MAX_DOCUMENT_BYTES) {
    throw new RichTextMcpInputError(
      "Rich Text document exceeds 5 MiB size limit"
    );
  }
}

function assertUniqueBlockIds(blocks: readonly RichTextBlockInput[]): void {
  const ids = new Set<string>();
  const pending = [...blocks];
  while (pending.length > 0) {
    const block = pending.pop()!;
    if (ids.has(block.id)) {
      throw new RichTextMcpInputError(
        `Duplicate Rich Text block ID: ${block.id}`
      );
    }
    ids.add(block.id);
    pending.push(...(block.children ?? []));
  }
}
