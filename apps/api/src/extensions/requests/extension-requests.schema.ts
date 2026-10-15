import type { infer as Infer } from "zod";
import { z } from "zod";

export const extensionRequestSchema = z.object({
  idea: z.string().trim().min(1).max(2000),
});

export const extensionRequestResponseSchema = z.object({
  success: z.literal(true),
});

export const ExtensionRequestDto = extensionRequestSchema.meta({
  id: "ExtensionRequestDto",
});
export type ExtensionRequestDto = Infer<typeof ExtensionRequestDto>;

export const ExtensionRequestResponseDto = extensionRequestResponseSchema.meta({
  id: "ExtensionRequestResponseDto",
});
export type ExtensionRequestResponseDto = Infer<
  typeof ExtensionRequestResponseDto
>;
