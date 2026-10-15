import type { infer as Infer } from "zod";
import { z } from "zod";

export const encryptionKeyResponseSchema = z.object({
  key: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const EncryptionKeyResponseDto = encryptionKeyResponseSchema.meta({
  id: "EncryptionKeyResponseDto",
});
export type EncryptionKeyResponseDto = Infer<typeof EncryptionKeyResponseDto>;
