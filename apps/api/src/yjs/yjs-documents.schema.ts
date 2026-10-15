import type { infer as Infer } from "zod";
import { z } from "zod";
import { paginationQuerySchema } from "@app/utils/pagination";
import { isCanonicalBase64 } from "./yjs-document-state";

const base64Schema = z
  .string()
  .min(1)
  .refine(isCanonicalBase64, "Must be canonical base64");

export const yjsDocumentSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  workspaceId: z.string(),
  updatedAt: z.string(),
});

export const YjsDocumentDto = yjsDocumentSchema.meta({ id: "YjsDocumentDto" });
export type YjsDocumentDto = Infer<typeof YjsDocumentDto>;

export const YjsDocumentsListQueryDto = paginationQuerySchema.meta({
  id: "YjsDocumentsListQueryDto",
});
export type YjsDocumentsListQueryDto = Infer<typeof YjsDocumentsListQueryDto>;

export const YjsDocumentsListResponseDto = z
  .object({
    items: z.array(yjsDocumentSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "YjsDocumentsListResponseDto" });
export type YjsDocumentsListResponseDto = Infer<
  typeof YjsDocumentsListResponseDto
>;

export const createYjsDocumentSchema = z.object({
  initialUpdateB64: base64Schema.optional(),
});

export const CreateYjsDocumentDto = createYjsDocumentSchema.meta({
  id: "CreateYjsDocumentDto",
});
export type CreateYjsDocumentDto = Infer<typeof CreateYjsDocumentDto>;

export const appendYjsDocumentUpdateSchema = z.object({
  updateB64: base64Schema,
});

export const AppendYjsDocumentUpdateDto = appendYjsDocumentUpdateSchema.meta({
  id: "AppendYjsDocumentUpdateDto",
});
export type AppendYjsDocumentUpdateDto = Infer<
  typeof AppendYjsDocumentUpdateDto
>;

export const YjsDocumentUpdateDto = z
  .object({
    createdAt: z.string(),
    documentId: z.string(),
    id: z.string(),
  })
  .meta({ id: "YjsDocumentUpdateDto" });
export type YjsDocumentUpdateDto = Infer<typeof YjsDocumentUpdateDto>;

export const YjsDocumentStateQueryDto = z
  .object({ stateVectorB64: base64Schema.optional() })
  .meta({ id: "YjsDocumentStateQueryDto" });
export type YjsDocumentStateQueryDto = Infer<typeof YjsDocumentStateQueryDto>;

export const YjsDocumentStateDto = z
  .object({
    documentId: z.string(),
    encoding: z.literal("yjs-update-v2"),
    stateVectorB64: z.string(),
    updateB64: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "YjsDocumentStateDto" });
export type YjsDocumentStateDto = Infer<typeof YjsDocumentStateDto>;

export const YjsDocumentJsonDto = z
  .object({
    data: z.record(z.string(), z.unknown()),
    documentId: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "YjsDocumentJsonDto" });
export type YjsDocumentJsonDto = Infer<typeof YjsDocumentJsonDto>;

export const YjsDocumentsParamsDto = z
  .object({ workspaceId: z.string().min(1) })
  .meta({ id: "YjsDocumentsParamsDto" });
export type YjsDocumentsParamsDto = Infer<typeof YjsDocumentsParamsDto>;

export const YjsDocumentParamsDto = z
  .object({
    documentId: z.string().min(1),
    workspaceId: z.string().min(1),
  })
  .meta({ id: "YjsDocumentParamsDto" });
export type YjsDocumentParamsDto = Infer<typeof YjsDocumentParamsDto>;

export const yjsDocumentCursorSchema = z.object({
  id: z.string(),
  updatedAt: z.string().datetime(),
});

export type CreateYjsDocumentInput = z.infer<typeof createYjsDocumentSchema>;
