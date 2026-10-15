import type { infer as Infer } from "zod";
import { z } from "zod";

export const uploadUrlRequestSchema = z.object({
  resource: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

export const UploadUrlRequestDto = uploadUrlRequestSchema.meta({
  id: "UploadUrlRequestDto",
});
export type UploadUrlRequestDto = Infer<typeof UploadUrlRequestDto>;

export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string(),
  key: z.string(),
  publicUrl: z.string(),
});

export const UploadUrlResponseDto = uploadUrlResponseSchema.meta({
  id: "UploadUrlResponseDto",
});
export type UploadUrlResponseDto = Infer<typeof UploadUrlResponseDto>;

export const confirmRequestSchema = z.object({
  key: z.string().min(1),
});

export const ConfirmRequestDto = confirmRequestSchema.meta({
  id: "ConfirmRequestDto",
});
export type ConfirmRequestDto = Infer<typeof ConfirmRequestDto>;

export const confirmResponseSchema = z.object({
  imageUrl: z.string(),
});

export const ConfirmResponseDto = confirmResponseSchema.meta({
  id: "ConfirmResponseDto",
});
export type ConfirmResponseDto = Infer<typeof ConfirmResponseDto>;
