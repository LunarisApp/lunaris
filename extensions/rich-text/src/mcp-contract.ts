import * as z from "zod";
import {
  RICH_TEXT_BLOCK_TYPES,
  RICH_TEXT_MAX_DOCUMENT_BLOCKS,
} from "./constants";

const blockIdSchema = z
  .string()
  .min(1)
  .describe("Stable unique BlockNote block ID.");

const blockPropsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export interface RichTextBlockInput {
  children?: RichTextBlockInput[];
  content?: z.output<typeof z.json>;
  id: string;
  props?: Record<string, string | number | boolean | null>;
  type: (typeof RICH_TEXT_BLOCK_TYPES)[number];
}

export interface RichTextBlockData {
  children: RichTextBlockData[];
  content?: z.output<typeof z.json>;
  id: string;
  props: Record<string, string | number | boolean | null>;
  type: (typeof RICH_TEXT_BLOCK_TYPES)[number];
}

export const richTextBlockInputSchema: z.ZodType<RichTextBlockInput> = z.lazy(
  () =>
    z.object({
      children: z.array(richTextBlockInputSchema).optional(),
      content: z.json().optional(),
      id: blockIdSchema,
      props: blockPropsSchema.optional(),
      type: z.enum(RICH_TEXT_BLOCK_TYPES),
    }),
);

export const richTextBlockSchema: z.ZodType<RichTextBlockData> = z.lazy(() =>
  z.object({
    children: z.array(richTextBlockSchema),
    content: z.json().optional(),
    id: blockIdSchema,
    props: blockPropsSchema,
    type: z.enum(RICH_TEXT_BLOCK_TYPES),
  }),
);

export const richTextReadMeOperationInputSchema = z.object({});
export const richTextReadMeInputSchema =
  richTextReadMeOperationInputSchema.extend({
    workspaceId: z.string().min(1).describe("Exact workspace ID."),
    organizationId: z.string().min(1).describe("Exact organization ID."),
  });
export const richTextReadMeOutputSchema = z.object({ guide: z.string() });

export const richTextGetDocumentOperationInputSchema = z.object({
  documentResourceId: z
    .string()
    .min(1)
    .describe("Exact Rich Text workspace resource ID."),
});
export const richTextGetDocumentInputSchema =
  richTextGetDocumentOperationInputSchema.extend({
    workspaceId: z
      .string()
      .min(1)
      .describe("Exact workspace ID containing the Rich Text document."),
    organizationId: z.string().min(1).describe("Exact organization ID."),
  });

export const richTextDocumentOutputSchema = z.object({
  blocks: z.array(richTextBlockSchema),
  documentResourceId: z.string(),
  markdown: z.string(),
  revision: z.string(),
});

export const richTextUpdateDocumentOperationInputSchema = z.object({
  blocks: z
    .array(richTextBlockInputSchema)
    .min(1)
    .max(RICH_TEXT_MAX_DOCUMENT_BLOCKS)
    .describe(
      "Complete replacement BlockNote document. Preserve IDs from rich_text_get_document for unchanged blocks.",
    ),
  documentResourceId: z
    .string()
    .min(1)
    .describe("Exact Rich Text workspace resource ID."),
  expectedRevision: z
    .string()
    .min(1)
    .describe("Revision returned by rich_text_get_document."),
});
export const richTextUpdateDocumentInputSchema =
  richTextUpdateDocumentOperationInputSchema.extend({
    idempotencyKey: z
      .string()
      .min(8)
      .max(200)
      .describe(
        "Stable unique key for this mutation. Reuse only when retrying the identical request.",
      ),
    workspaceId: z
      .string()
      .min(1)
      .describe("Exact workspace ID containing the Rich Text document."),
    organizationId: z.string().min(1).describe("Exact organization ID."),
  });

export type RichTextDocumentOutput = z.output<
  typeof richTextDocumentOutputSchema
>;
