import { Image, Text, View } from "@react-pdf/renderer";
import type {
  ColumnsSection,
  PdfSection,
  GroupSection,
  KeyValueSection,
} from "./content";
import { createElement, type ReactNode } from "react";
import { renderBlockNoteExtension } from "./blocknote";
import { renderCodeContent, renderListItems, renderTableContent } from "./primitives";
import { headingStyleFor, type Styles } from "./styles";
import type { PdfTheme } from "./theme";

const MAX_SECTION_DEPTH = 5;

interface SectionCtx {
  depth: number;
  key: number;
  styles: Styles;
  theme: PdfTheme;
}

type SectionRenderer<S extends PdfSection = PdfSection> = (
  section: S,
  ctx: SectionCtx
) => ReactNode;

const heading: SectionRenderer = (section, { key, styles }) => {
  if (section.type !== "heading") return null;
  return createElement(
    Text,
    { key, style: headingStyleFor(styles, section.level) },
    section.text
  );
};

const paragraph: SectionRenderer = (section, { key, styles }) => {
  if (section.type !== "paragraph") return null;
  if (!section.text.trim()) return null;
  return createElement(Text, { key, style: styles.paragraph }, section.text);
};

const image: SectionRenderer = (section, { key, styles }) => {
  if (section.type !== "image") return null;
  return createElement(Image, {
    key,
    src: section.dataUrl,
    style: styles.image,
  });
};

const extension: SectionRenderer = (section, { key, styles, theme }) => {
  if (section.type !== "extension") return null;
  if (section.kind !== "blocknote") return null;
  return createElement(
    View,
    { key },
    ...renderBlockNoteExtension(section.data, styles, theme)
  );
};

const divider: SectionRenderer = (section, { key, theme }) => {
  if (section.type !== "divider") return null;
  const borderStyle = section.style ?? "solid";
  return createElement(View, {
    key,
    style: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.tableBorder,
      borderBottomStyle: borderStyle,
      marginTop: theme.spacing.paragraphGap,
      marginBottom: theme.spacing.paragraphGap,
    },
  });
};

const table: SectionRenderer = (section, { key, styles, theme }) => {
  if (section.type !== "table") return null;
  return createElement(
    View,
    { key },
    renderTableContent(section.rows, styles, theme, {
      headers: section.headers,
      columnWidths: section.columnWidths,
    })
  );
};

const list: SectionRenderer = (section, { key, styles, theme }) => {
  if (section.type !== "list") return null;
  return createElement(
    View,
    { key, style: { marginBottom: theme.spacing.paragraphGap } },
    ...renderListItems(section.items, section.style, styles, theme)
  );
};

function renderKeyValueSection(
  section: KeyValueSection,
  styles: Styles,
  theme: PdfTheme,
  key: number
): ReactNode {
  const layout = section.layout ?? "inline";

  if (layout === "table") {
    return createElement(
      View,
      { key },
      renderTableContent(
        section.entries.map((e) => [e.key, e.value]),
        styles,
        theme
      )
    );
  }

  if (layout === "stacked") {
    return createElement(
      View,
      { key, style: { marginBottom: theme.spacing.paragraphGap } },
      ...section.entries.map((entry, i) =>
        createElement(
          View,
          { key: i, style: { marginBottom: 4 } },
          createElement(
            Text,
            {
              style: {
                fontFamily: "Helvetica-Bold",
                fontSize: theme.fontSize.body,
              },
            },
            entry.key
          ),
          createElement(Text, null, entry.value)
        )
      )
    );
  }

  // inline (default)
  return createElement(
    View,
    { key, style: { marginBottom: theme.spacing.paragraphGap } },
    ...section.entries.map((entry, i) =>
      createElement(
        Text,
        { key: i, style: { marginBottom: 2 } },
        createElement(
          Text,
          { style: { fontFamily: "Helvetica-Bold" } },
          `${entry.key}: `
        ),
        entry.value
      )
    )
  );
}

const keyValue: SectionRenderer = (section, { key, styles, theme }) => {
  if (section.type !== "key-value") return null;
  return renderKeyValueSection(section, styles, theme, key);
};

const code: SectionRenderer = (section, { key, styles }) => {
  if (section.type !== "code") return null;
  return createElement(View, { key }, renderCodeContent(section.code, styles));
};

function renderGroupSection(
  section: GroupSection,
  ctx: SectionCtx
): ReactNode {
  const { styles, theme, key, depth } = ctx;
  const containerStyle = {
    marginBottom: theme.spacing.paragraphGap,
    ...(section.border
      ? {
          borderWidth: 1 as const,
          borderColor: theme.colors.tableBorder,
          borderRadius: 3,
          padding: 8,
        }
      : {}),
    ...(section.backgroundColor
      ? {
          backgroundColor: section.backgroundColor,
          ...(section.border ? {} : { padding: 8, borderRadius: 3 }),
        }
      : {}),
  };

  const titleEl = section.title
    ? createElement(
        Text,
        {
          style: {
            fontFamily: "Helvetica-Bold",
            fontSize: theme.fontSize.h3,
            color: theme.colors.heading,
            marginBottom: 4,
          },
        },
        section.title
      )
    : null;

  const children = section.sections.map((child, i) =>
    renderSection(child, { styles, theme, depth: depth + 1, key: i })
  );

  return createElement(View, { key, style: containerStyle }, titleEl, ...children);
}

function renderColumnsSection(
  section: ColumnsSection,
  ctx: SectionCtx
): ReactNode {
  const { styles, theme, key, depth } = ctx;
  const [leftRatio, rightRatio] = section.ratio ?? [1, 1];

  const leftChildren = section.left.map((child, i) =>
    renderSection(child, { styles, theme, depth: depth + 1, key: i })
  );
  const rightChildren = section.right.map((child, i) =>
    renderSection(child, { styles, theme, depth: depth + 1, key: i })
  );

  return createElement(
    View,
    {
      key,
      style: {
        flexDirection: "row" as const,
        gap: 10,
        marginBottom: theme.spacing.paragraphGap,
      },
    },
    createElement(View, { style: { flex: leftRatio } }, ...leftChildren),
    createElement(View, { style: { flex: rightRatio } }, ...rightChildren)
  );
}

const group: SectionRenderer = (section, ctx) => {
  if (section.type !== "group") return null;
  return renderGroupSection(section, ctx);
};

const columns: SectionRenderer = (section, ctx) => {
  if (section.type !== "columns") return null;
  return renderColumnsSection(section, ctx);
};

const spacer: SectionRenderer = (section, { key, theme }) => {
  if (section.type !== "spacer") return null;
  return createElement(View, {
    key,
    style: { height: section.height ?? theme.spacing.paragraphGap },
  });
};

const SECTION_RENDERERS: Record<PdfSection["type"], SectionRenderer> = {
  heading,
  paragraph,
  image,
  extension,
  divider,
  table,
  list,
  "key-value": keyValue,
  code,
  group,
  columns,
  spacer,
};

export function renderSection(
  section: PdfSection,
  ctx: SectionCtx
): ReactNode {
  if (ctx.depth > MAX_SECTION_DEPTH) {
    return createElement(
      Text,
      { key: ctx.key, style: { fontStyle: "italic", color: "#999" } },
      "[Content too deeply nested]"
    );
  }
  const renderer = SECTION_RENDERERS[section.type];
  return renderer ? renderer(section, ctx) : null;
}
