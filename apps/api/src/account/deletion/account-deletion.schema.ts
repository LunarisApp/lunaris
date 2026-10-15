import type { infer as Infer } from "zod";
import { z } from "zod";

export const deletionRequestResponseSchema = z.object({
  success: z.boolean(),
});

export const DeletionRequestResponseDto = deletionRequestResponseSchema.meta({
  id: "DeletionRequestResponseDto",
});
export type DeletionRequestResponseDto = Infer<
  typeof DeletionRequestResponseDto
>;
