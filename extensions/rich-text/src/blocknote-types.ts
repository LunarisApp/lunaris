import type { Block, InlineContent, TableContent } from "@blocknote/core";
import type { richTextHeadlessSchema } from "./entity-reference-schema";

type Schema = typeof richTextHeadlessSchema;
export type RichTextBlock = Block<
  Schema["blockSchema"],
  Schema["inlineContentSchema"],
  Schema["styleSchema"]
>;
export type RichTextInline = InlineContent<
  Schema["inlineContentSchema"],
  Schema["styleSchema"]
>;
export type RichTextTable = TableContent<
  Schema["inlineContentSchema"],
  Schema["styleSchema"]
>;
