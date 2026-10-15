import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderDocument } from "./document";
import { DEFAULT_PDF_THEME } from "./theme";

interface PdfNodeProps {
  children?: unknown;
  fixed?: boolean;
  render?: (args: { pageNumber: number }) => string;
  style?: unknown;
}

vi.mock("@react-pdf/renderer", () => {
  const { createElement } = require("react");

  const makeComponent = (name: string) => {
    const Component = (props: Record<string, unknown>) =>
      createElement(name, props);
    Component.displayName = name;
    return Component;
  };

  return {
    Document: makeComponent("Document"),
    Page: makeComponent("Page"),
    Text: makeComponent("Text"),
    View: makeComponent("View"),
    Link: makeComponent("Link"),
    Image: makeComponent("Image"),
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T) => styles,
    },
  };
});

function flattenChildren(node: unknown): Array<ReactElement<PdfNodeProps>> {
  if (!node || typeof node !== "object") return [];
  const element = node as ReactElement<PdfNodeProps>;
  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  return [
    element,
    ...childList.flatMap((child) => flattenChildren(child)),
  ];
}

describe("renderDocument", () => {
  const content = [
    { title: "Doc", sections: [{ type: "paragraph", text: "Hi" } as const] },
  ];

  it("omits page numbers by default", () => {
    const doc = renderDocument(content, DEFAULT_PDF_THEME);
    const fixedText = flattenChildren(doc).find((node) => node.props?.fixed);

    expect(fixedText).toBeUndefined();
  });

  it("renders fixed page number text when enabled", () => {
    const doc = renderDocument(content, {
      ...DEFAULT_PDF_THEME,
      pageNumbers: { enabled: true },
    });
    const fixedText = flattenChildren(doc).find((node) => node.props?.fixed);

    expect(fixedText?.props?.render?.({ pageNumber: 3 })).toBe("3");
    expect(fixedText?.props?.style).toMatchObject({
      position: "absolute",
      textAlign: "center",
    });
    expect(fixedText?.props?.style).not.toHaveProperty("bottom");
  });
});
