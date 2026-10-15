import { Image, Text, View } from "@react-pdf/renderer";
import type { JsonValue } from "@lunarisapp/plugin-sdk";
import { createElement, type ReactNode } from "react";
import type { BlockContent, InlineContent } from "./inline";
import { getInlineContentText, renderInlineContent } from "./inline";
import { renderCodeContent, renderTableContent } from "./primitives";
import { headingStyleFor, type Styles } from "./styles";
import type { PdfTheme } from "./theme";

interface NumberingState {
  counters: Map<string, number>;
}

interface TableCellContent {
  content?: InlineContent[];
}

interface BlockCtx {
  block: BlockContent;
  children: BlockContent[];
  content: InlineContent[];
  depth: number;
  key: string | number;
  numbering: NumberingState;
  styles: Styles;
  theme: PdfTheme;
}

function listIndent(depth: number, theme: PdfTheme) {
  return { paddingLeft: depth * theme.spacing.listIndent };
}

/**
 * Per-block renderer. Each function returns a ReactNode or null.
 * Unknown block types fall through to the default entry in the map.
 */
type BlockRenderer = (ctx: BlockCtx) => ReactNode;

function renderListBlock(
  symbol: (ctx: BlockCtx) => string
): BlockRenderer {
  return (ctx) => {
    const { content, children, depth, key, styles, theme, numbering } =
      ctx;
    return createElement(
      View,
      {
        key,
        style: { ...styles.listItem, ...listIndent(depth, theme) },
      },
      createElement(Text, { style: styles.listBullet }, symbol(ctx)),
      createElement(
        View,
        { style: styles.listContent },
        createElement(Text, null, ...renderInlineContent(content, theme)),
        ...children.map((child, idx) =>
          renderBlock(child, styles, theme, numbering, depth + 1, `${key}.${idx}`)
        )
      )
    );
  };
}

const BLOCK_RENDERERS: Record<string, BlockRenderer> = {
  heading: ({ block, content, key, styles, theme }) => {
    const level = (block.props?.level as number) ?? 1;
    return createElement(
      Text,
      { key, style: headingStyleFor(styles, level) },
      ...renderInlineContent(content, theme)
    );
  },

  paragraph: ({ content, key, styles, theme }) => {
    const hasContent =
      content.length > 0 &&
      content.some((item) => getInlineContentText(item).trim() !== "");
    if (!hasContent) {
      return createElement(View, {
        key,
        style: { marginBottom: theme.spacing.paragraphGap / 2 },
      });
    }
    return createElement(
      Text,
      { key, style: styles.paragraph },
      ...renderInlineContent(content, theme)
    );
  },

  bulletListItem: renderListBlock(() => "\u2022"),

  numberedListItem: renderListBlock(({ block, depth, numbering }) => {
    const counterKey = `${depth}-${block.props?.["_parentId"] ?? "root"}`;
    const current = (numbering.counters.get(counterKey) ?? 0) + 1;
    numbering.counters.set(counterKey, current);
    return `${current}.`;
  }),

  checkListItem: renderListBlock(({ block }) =>
    block.props?.checked === true ? "\u2611" : "\u2610"
  ),

  codeBlock: ({ content, styles }) => {
    const code = content.map(getInlineContentText).join("");
    return renderCodeContent(code, styles);
  },

  image: ({ block, key, styles, theme }) => {
    const url = block.props?.url as string | undefined;
    if (!url) return null;
    const caption = block.props?.caption as string | undefined;
    return createElement(
      View,
      { key },
      createElement(Image, { src: url, style: styles.image }),
      caption
        ? createElement(
            Text,
            {
              style: {
                fontSize: 9,
                color: "#666",
                marginBottom: theme.spacing.paragraphGap,
              },
            },
            caption
          )
        : null
    );
  },

  table: ({ block, styles, theme }) => {
    const tableContent = block.content as unknown as
      | {
          rows: Array<{
            cells: Array<InlineContent[] | TableCellContent>;
          }>;
        }
      | undefined;
    if (!Array.isArray(tableContent?.rows)) return null;
    const richRows = tableContent.rows.map((row) =>
      row.cells.map((cell) =>
        Array.isArray(cell) ? cell : (cell.content ?? [])
      )
    );
    return renderTableContent(richRows, styles, theme, { isRichText: true });
  },
};

const fallbackBlockRenderer: BlockRenderer = ({ content, key, styles, theme }) => {
  if (content.length > 0) {
    return createElement(
      Text,
      { key, style: styles.paragraph },
      ...renderInlineContent(content, theme)
    );
  }
  return null;
};

function renderBlock(
  block: BlockContent,
  styles: Styles,
  theme: PdfTheme,
  numbering: NumberingState,
  depth = 0,
  keyPrefix: string | number = "blk"
): ReactNode {
  const content = block.content ?? [];
  const children = block.children ?? [];
  const key = block.id ?? `${keyPrefix}`;
  const renderer = BLOCK_RENDERERS[block.type] ?? fallbackBlockRenderer;
  return renderer({
    block,
    content,
    children,
    depth,
    key,
    numbering,
    styles,
    theme,
  });
}

export function renderBlockNoteExtension(
  data: JsonValue,
  styles: Styles,
  theme: PdfTheme
): ReactNode[] {
  const numbering: NumberingState = { counters: new Map() };
  const blocks = data as unknown as BlockContent[];
  let lastType: string | undefined;

  return blocks.map((block, i) => {
    // Reset numbering counter when block type changes from numberedListItem
    if (lastType === "numberedListItem" && block.type !== "numberedListItem") {
      numbering.counters.clear();
    }
    lastType = block.type;
    return renderBlock(block, styles, theme, numbering, 0, i);
  });
}
