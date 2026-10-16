import { Text, View } from "@react-pdf/renderer";
import type { ListItem } from "./content";
import { createElement } from "react";
import type { InlineContent } from "./inline";
import { renderInlineContent } from "./inline";
import type { Styles } from "./styles";
import type { PdfTheme } from "./theme";

/**
 * Shared table renderer. Rows can be plain strings (top-level TableSection)
 * or arrays of InlineContent (rich-text table blocks, indicated by
 * `options.isRichText`).
 */
export function renderTableContent(
  rows: string[][] | InlineContent[][][],
  styles: Styles,
  theme: PdfTheme,
  options?: {
    headers?: string[];
    columnWidths?: number[];
    isRichText?: boolean;
  }
): React.ReactNode {
  const { headers, columnWidths, isRichText } = options ?? {};

  const cellStyle = (colIndex: number, totalCols: number) => ({
    ...styles.tableCell,
    ...(columnWidths && columnWidths[colIndex] !== undefined
      ? { flex: columnWidths[colIndex] }
      : {}),
    ...(colIndex === totalCols - 1 ? { borderRightWidth: 0 } : {}),
  });

  const headerRow = headers
    ? createElement(
        View,
        {
          key: "header",
          style: {
            ...styles.tableRow,
            backgroundColor: theme.colors.codeBg,
          },
        },
        ...headers.map((h, ci) =>
          createElement(
            View,
            { key: ci, style: cellStyle(ci, headers.length) },
            createElement(Text, { style: { fontFamily: "Helvetica-Bold" } }, h)
          )
        )
      )
    : null;

  const dataRows = rows.map((row, ri) =>
    createElement(
      View,
      { key: ri, style: styles.tableRow },
      ...(row as unknown[]).map((cell, ci) =>
        createElement(
          View,
          { key: ci, style: cellStyle(ci, row.length) },
          isRichText
            ? createElement(
                Text,
                null,
                ...renderInlineContent(cell as InlineContent[], theme)
              )
            : createElement(Text, null, cell as string)
        )
      )
    )
  );

  return createElement(
    View,
    { style: styles.tableContainer },
    headerRow,
    ...dataRows
  );
}

export function renderListItems(
  items: ListItem[],
  listStyle: "bullet" | "numbered" | "checkbox",
  styles: Styles,
  theme: PdfTheme,
  depth = 0
): React.ReactNode[] {
  let counter = 0;
  return items.map((item, i) => {
    counter++;
    let symbol: string;
    if (listStyle === "bullet") {
      symbol = depth === 0 ? "\u2022" : depth === 1 ? "\u25E6" : "\u2023";
    } else if (listStyle === "numbered") {
      symbol = `${counter}.`;
    } else {
      symbol = item.checked ? "\u2611" : "\u2610";
    }

    const children = item.children
      ? renderListItems(item.children, listStyle, styles, theme, depth + 1)
      : [];

    return createElement(
      View,
      {
        key: i,
        style: {
          ...styles.listItem,
          paddingLeft: depth * theme.spacing.listIndent,
        },
      },
      createElement(Text, { style: styles.listBullet }, symbol),
      createElement(
        View,
        { style: styles.listContent },
        createElement(Text, null, item.text),
        ...children
      )
    );
  });
}

export function renderCodeContent(
  code: string,
  styles: Styles
): React.ReactNode {
  return createElement(
    View,
    { style: styles.codeBlock },
    createElement(Text, null, code)
  );
}
