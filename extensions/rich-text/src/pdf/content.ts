import type { JsonValue } from "@lunarisapp/plugin-sdk";

export interface HeadingSection {
  level: 1 | 2 | 3;
  text: string;
  type: "heading";
}
export interface ParagraphSection {
  text: string;
  type: "paragraph";
}
export interface ImageSection {
  dataUrl: string;
  height: number;
  type: "image";
  width: number;
}
export interface ExtensionSection {
  data: JsonValue;
  kind: string;
  type: "extension";
}
export interface DividerSection {
  style?: "solid" | "dashed" | "dotted";
  type: "divider";
}
export interface TableSection {
  columnWidths?: number[];
  headers?: string[];
  rows: string[][];
  type: "table";
}
export interface ListItem {
  checked?: boolean;
  children?: ListItem[];
  text: string;
}
export interface ListSection {
  items: ListItem[];
  style: "bullet" | "numbered" | "checkbox";
  type: "list";
}
export interface KeyValueSection {
  entries: Array<{ key: string; value: string }>;
  layout?: "inline" | "stacked" | "table";
  type: "key-value";
}
export interface CodeSection {
  code: string;
  language?: string;
  type: "code";
}
export interface GroupSection {
  backgroundColor?: string;
  border?: boolean;
  sections: PdfSection[];
  title?: string;
  type: "group";
}
export interface ColumnsSection {
  left: PdfSection[];
  ratio?: [number, number];
  right: PdfSection[];
  type: "columns";
}
export interface SpacerSection {
  height?: number;
  type: "spacer";
}
export type PdfSection =
  | HeadingSection
  | ParagraphSection
  | ImageSection
  | ExtensionSection
  | DividerSection
  | TableSection
  | ListSection
  | KeyValueSection
  | CodeSection
  | GroupSection
  | ColumnsSection
  | SpacerSection;
export interface PdfContent {
  sections: PdfSection[];
  title: string;
}
