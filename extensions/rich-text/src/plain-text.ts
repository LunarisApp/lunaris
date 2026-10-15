import { BlockNoteEditor } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import type { Doc } from "yjs";
import { richTextHeadlessSchema } from "./entity-reference-schema";

export function richTextDocToPlainText(doc: Doc): string {
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });
  try {
    return blockListToPlainText(yXmlFragmentToBlocks(editor, doc.getXmlFragment()));
  } finally {
    editor._tiptapEditor?.destroy();
  }
}

export function blockListToPlainText(blocks: unknown[]): string {
  return blockListToTextLines(blocks).join("\n");
}

export function blockListToTextLines(blocks: unknown[]): string[] {
  const lines: string[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const line = normalizeLine(extractInlineText((block as { content?: unknown }).content));
    if (line) {
      lines.push(line);
    }

    const children = (block as { children?: unknown }).children;
    if (Array.isArray(children)) {
      lines.push(...blockListToTextLines(children));
    }
  }

  return lines;
}

function extractInlineText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractInlineText(item)).join("");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (
    "type" in value &&
    value.type === "entityReference" &&
    "props" in value &&
    value.props &&
    typeof value.props === "object" &&
    "name" in value.props &&
    typeof value.props.name === "string"
  ) {
    return `@${value.props.name}`;
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }

  if ("content" in value) {
    return extractInlineText(value.content);
  }

  return "";
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}
