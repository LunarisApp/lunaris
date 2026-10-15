import type { infer as Infer } from "zod";
import { z } from "zod";

const crudEntrySchema = z.object({
  op: z.enum(["PUT", "PATCH", "DELETE"]),
  type: z.string(),
  id: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const transactionSchema = z.object({
  transactionId: z.number().optional(),
  crud: z.array(crudEntrySchema),
});

export const syncRequestSchema = z.object({
  transactions: z.array(transactionSchema),
});

export const SyncRequestDto = syncRequestSchema.meta({ id: "SyncRequestDto" });
export type SyncRequestDto = Infer<typeof SyncRequestDto>;

export const syncResponseSchema = z.object({});

export const SyncResponseDto = syncResponseSchema.meta({
  id: "SyncResponseDto",
});
export type SyncResponseDto = Infer<typeof SyncResponseDto>;

export const syncCredentialsResponseSchema = z.object({
  token: z.string(),
  powersyncUrl: z.string(),
  expiresAt: z.number(),
});

export const SyncCredentialsResponseDto = syncCredentialsResponseSchema.meta({
  id: "SyncCredentialsResponseDto",
});
export type SyncCredentialsResponseDto = Infer<
  typeof SyncCredentialsResponseDto
>;
