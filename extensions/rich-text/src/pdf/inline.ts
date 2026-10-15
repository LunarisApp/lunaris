import { Link, Text } from "@react-pdf/renderer";
import { createElement } from "react";
import type { PdfTheme } from "./theme";

export interface InlineContent {
  href?: string;
  props?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  text?: string;
  type: string;
}

export interface BlockContent {
  children?: BlockContent[];
  content?: InlineContent[];
  id?: string;
  props?: Record<string, unknown>;
  type: string;
}

export function getInlineContentText(item: InlineContent): string {
  if (item.type === "entityReference") {
    const name = item.props?.name;
    return typeof name === "string" ? `@${name}` : "";
  }
  return item.text ?? "";
}

function resolveFontFamily(
  bold: boolean,
  italic: boolean,
  code: boolean
): string {
  if (code) return "Courier";
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

export function renderInlineContent(
  content: InlineContent[],
  theme: PdfTheme
): React.ReactNode[] {
  return content.map((item, i) => {
    const styles = item.styles ?? {};
    const isBold = styles.bold === true;
    const isItalic = styles.italic === true;
    const isCode = styles.code === true;
    const isUnderline = styles.underline === true;
    const isStrike = styles.strike === true;

    const textStyle: Record<string, string | number> = {
      fontFamily: resolveFontFamily(isBold, isItalic, isCode),
    };

    if (isUnderline && isStrike) {
      textStyle.textDecoration = "underline line-through";
    } else if (isUnderline) {
      textStyle.textDecoration = "underline";
    } else if (isStrike) {
      textStyle.textDecoration = "line-through";
    }

    if (styles.textColor && styles.textColor !== "default") {
      textStyle.color = styles.textColor as string;
    }
    if (styles.backgroundColor && styles.backgroundColor !== "default") {
      textStyle.backgroundColor = styles.backgroundColor as string;
    }
    if (isCode) {
      textStyle.fontSize = theme.fontSize.code;
      textStyle.backgroundColor = theme.colors.codeBg;
    }

    const textEl = createElement(
      Text,
      { key: i, style: textStyle },
      getInlineContentText(item)
    );

    if (item.type === "link" && item.href) {
      return createElement(
        Link,
        {
          key: i,
          src: item.href,
          style: { color: theme.colors.link, textDecoration: "underline" },
        },
        textEl
      );
    }

    return textEl;
  });
}
