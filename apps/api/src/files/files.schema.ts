import type { infer as Infer } from "zod";
import { z } from "zod";

const mediaTypeSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(
    /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/,
    "Invalid media type"
  );

const fileExtensionSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-zA-Z0-9]+$/, "Invalid file extension");

export const createUploadSessionSchema = z.object({
  id: z.uuid(),
  fileId: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/),
  workspaceId: z.string().min(1),
  sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  mediaType: mediaTypeSchema,
  replacementFileId: z.string().min(1).optional(),
  replacementStorageId: z.string().min(1).optional(),
});
export const CreateUploadSessionDto = createUploadSessionSchema.meta({
  id: "CreateUploadSessionDto",
});
export type CreateUploadSessionDto = Infer<typeof CreateUploadSessionDto>;
export const SignUploadPartDto = z
  .object({ partNumber: z.number().int().min(1).max(299) })
  .meta({ id: "SignUploadPartDto" });
export type SignUploadPartDto = Infer<typeof SignUploadPartDto>;
export const UploadSessionResponseDto = z
  .object({
    id: z.string(),
    state: z.string(),
    sizeBytes: z.number(),
    partSize: z.number(),
    expiresAt: z.string(),
    uploadedParts: z.array(z.number()),
  })
  .meta({ id: "UploadSessionResponseDto" });
export type UploadSessionResponseDto = Infer<typeof UploadSessionResponseDto>;
export const UploadPartResponseDto = z
  .object({ url: z.string(), sizeBytes: z.number() })
  .meta({ id: "UploadPartResponseDto" });
export type UploadPartResponseDto = Infer<typeof UploadPartResponseDto>;
export const UploadSessionStateDto = z
  .object({ id: z.string(), state: z.string() })
  .meta({ id: "UploadSessionStateDto" });
export type UploadSessionStateDto = Infer<typeof UploadSessionStateDto>;

export const downloadUrlQuerySchema = z
  .object({
    fileExtension: fileExtensionSchema.optional(),
    filename: z.string().min(1).max(255).optional(),
    workspaceId: z.string().min(1),
  })
  .refine((query) => query.fileExtension || query.filename, {
    message: "fileExtension or filename is required",
  });

export const FileUrlQueryDto = downloadUrlQuerySchema.meta({
  id: "FileUrlQueryDto",
});
export type FileUrlQueryDto = Infer<typeof FileUrlQueryDto>;

export const downloadUrlResponseSchema = z.object({
  downloadUrl: z.string(),
});

export const FileDownloadUrlResponseDto = downloadUrlResponseSchema.meta({
  id: "FileDownloadUrlResponseDto",
});
export type FileDownloadUrlResponseDto = Infer<
  typeof FileDownloadUrlResponseDto
>;

export const deleteFileResponseSchema = z.object({
  id: z.string(),
});

export const DeleteFileResponseDto = deleteFileResponseSchema.meta({
  id: "DeleteFileResponseDto",
});
export type DeleteFileResponseDto = Infer<typeof DeleteFileResponseDto>;
