import {
  RICH_TEXT_MAX_DOCUMENT_BLOCKS,
  RICH_TEXT_MAX_DOCUMENT_BYTES,
} from "./constants";
import type {
  RichTextBlockData,
  RichTextBlockInput,
  RichTextEdit,
} from "./mcp-contract";
import type { Doc, XmlFragment } from "yjs";
import type { BlockSchema } from "@blocknote/core";

export interface RichTextRuntimeAdapter {
  blockSchema: BlockSchema;
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

Call rich_text_get_document before editing. Prefer rich_text_edit_document for targeted changes: update content/props, insert blocks under parentBlockId after afterBlockId (null means root/first), or delete a block and its children. Edits run in order, atomically, behind expectedRevision. Omitted fields and unrelated blocks stay unchanged. The receipt returns the next revision. Reread after a revision conflict before rebuilding edits.

Use rich_text_update_document for initial content or a complete rewrite. Preserve unchanged block IDs. Every block needs a unique ID across the entire nested tree. Never reconstruct native content from the lossy Markdown preview.

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
    replaceRichTextDocument: (
      doc: Doc,
      requested: readonly RichTextBlockInput[]
    ) =>
      withAdapter(createAdapter, (adapter) =>
        writeBlocks(adapter, doc, requested, async (blocks) => ({
          blocks: cloneRichTextBlocks(blocks),
          markdown: await adapter.blocksToMarkdown(blocks),
        }))
      ),
    editRichTextDocument: (doc: Doc, edits: readonly RichTextEdit[]) =>
      withAdapter(createAdapter, async (adapter) => {
        const blocks = cloneRichTextBlocks(
          adapter.yXmlFragmentToBlocks(doc.getXmlFragment())
        );
        const requested = applyRichTextEdits(
          blocks,
          edits,
          adapter.blockSchema
        );
        return writeBlocks(adapter, doc, requested, () => ({
          appliedEdits: edits.length,
        }));
      }),
  };
}

async function writeBlocks<T>(
  adapter: RichTextRuntimeAdapter,
  doc: Doc,
  requested: readonly RichTextBlockInput[],
  prepareResult: (blocks: RichTextBlockData[]) => Promise<T> | T
) {
  assertRichTextDocumentInput(requested);
  try {
    const blocks = adapter.normalizeBlocks(structuredClone(requested));
    assertRichTextDocumentLimits(blocks);
    assertUniqueBlockIds(blocks);
    const result = await prepareResult(blocks);
    adapter.blocksToYXmlFragment(blocks, doc.getXmlFragment());
    return result;
  } catch (error) {
    if (error instanceof RichTextMcpInputError) {
      throw error;
    }
    throw new RichTextMcpInputError(
      error instanceof Error ? error.message : "Invalid BlockNote document"
    );
  }
}

function applyRichTextEdits(
  blocks: RichTextBlockInput[],
  edits: readonly RichTextEdit[],
  blockSchema: BlockSchema
) {
  for (const edit of edits) {
    if (edit.op === "insert") {
      assertInsertedBlockProps(edit.blocks, blockSchema);
      const siblings =
        edit.parentBlockId === null
          ? blocks
          : (findBlock(blocks, edit.parentBlockId).block.children ??= []);
      const afterIndex =
        edit.afterBlockId === null
          ? -1
          : siblings.findIndex(({ id }) => id === edit.afterBlockId);
      if (edit.afterBlockId !== null && afterIndex < 0) {
        throw new RichTextMcpInputError(
          `Insertion sibling not found in parent: ${edit.afterBlockId}`
        );
      }
      siblings.splice(afterIndex + 1, 0, ...structuredClone(edit.blocks));
    } else {
      const { block, siblings, index } = findBlock(blocks, edit.blockId);
      if (edit.op === "delete") {
        siblings.splice(index, 1);
      } else {
        if (
          edit.content === undefined &&
          Object.keys(edit.props ?? {}).length === 0
        ) {
          throw new RichTextMcpInputError(
            "Block update requires content or props"
          );
        }
        if (edit.content !== undefined) {
          block.content = structuredClone(edit.content);
        }
        if (edit.props !== undefined) {
          assertBlockProps(block.type, edit.props, blockSchema);
          block.props = { ...block.props, ...edit.props };
        }
      }
    }
    // Validate each intermediate tree so subsequent targets remain unambiguous.
    assertRichTextDocumentInput(blocks);
  }
  if (blocks.length === 0) {
    throw new RichTextMcpInputError(
      "Keep at least one Rich Text block; clear its content to empty the resource"
    );
  }
  return blocks;
}

function assertInsertedBlockProps(
  blocks: readonly RichTextBlockInput[],
  blockSchema: BlockSchema
): void {
  const pending = [...blocks];
  while (pending.length > 0) {
    const block = pending.pop()!;
    assertBlockProps(block.type, block.props ?? {}, blockSchema);
    pending.push(...(block.children ?? []));
  }
}

function assertBlockProps(
  type: RichTextBlockInput["type"],
  props: NonNullable<RichTextBlockInput["props"]>,
  blockSchema: BlockSchema
): void {
  if (!Object.hasOwn(blockSchema, type)) {
    throw new RichTextMcpInputError(
      `Unsupported Rich Text block type: ${type}`
    );
  }
  const propSchema = blockSchema[type]!.propSchema;
  for (const [key, value] of Object.entries(props)) {
    if (!Object.hasOwn(propSchema, key)) {
      throw new RichTextMcpInputError(
        `Unknown Rich Text ${type} property: ${key}`
      );
    }
    const spec = propSchema[key]!;
    const expectedType = "type" in spec ? spec.type : typeof spec.default;
    if (
      value === null ||
      typeof value !== expectedType ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (spec.values && !spec.values.includes(value))
    ) {
      throw new RichTextMcpInputError(
        `Invalid Rich Text ${type} property: ${key}`
      );
    }
  }
}

function findBlock(blocks: RichTextBlockInput[], blockId: string) {
  const pending = [blocks];
  while (pending.length > 0) {
    const siblings = pending.pop()!;
    for (const [index, block] of siblings.entries()) {
      if (block.id === blockId) {
        return { block, siblings, index };
      }
      if (block.children?.length) {
        pending.push(block.children);
      }
    }
  }
  throw new RichTextMcpInputError(`Rich Text block not found: ${blockId}`);
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
