import { Document, Page, Text } from "@react-pdf/renderer";
import type { PdfContent } from "./content";
import { createElement } from "react";
import { renderSection } from "./sections";
import { createStyles } from "./styles";
import type { PdfTheme } from "./theme";

export function renderDocument(
  contents: PdfContent[],
  theme: PdfTheme,
  noContentLabel = "(No content)"
): React.ReactElement {
  const styles = createStyles(theme);

  const pages = contents.map((content, ci) => {
    const sectionElements = content.sections.map((section, si) =>
      renderSection(section, { styles, theme, depth: 0, key: si })
    );

    return createElement(
      Page,
      { key: ci, size: "A4", style: styles.page, wrap: true },
      content.title
        ? createElement(Text, { style: styles.title }, content.title)
        : null,
      sectionElements.length > 0
        ? sectionElements
        : createElement(
            Text,
            { style: { fontStyle: "italic" } },
            noContentLabel
          ),
      theme.pageNumbers.enabled
        ? createElement(Text, {
            fixed: true,
            render: ({ pageNumber }: { pageNumber: number }) =>
              String(pageNumber),
            style: styles.pageNumber,
          })
        : null
    );
  });

  return createElement(Document, null, ...pages);
}
