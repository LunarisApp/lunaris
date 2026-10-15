import type { infer as Infer } from "zod";
import { z } from "zod";

export const backupStatusSchema = z.enum([
  "queued",
  "processing",
  "ready",
  "failed",
  "expired",
]);

export const backupPhaseSchema = z.enum([
  "queued",
  "snapshotting",
  "archiving",
  "finalizing",
  "ready",
  "failed",
  "expired",
]);

export const backupSchema = z.object({
  id: z.string(),
  status: backupStatusSchema,
  phase: backupPhaseSchema,
  progress: z.object({
    processedFiles: z.number().int().nonnegative(),
    totalFiles: z.number().int().nonnegative().nullable(),
    processedBytes: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative().nullable(),
  }),
  filename: z.string().nullable(),
  archiveSizeBytes: z.number().int().nonnegative().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export const BackupDto = backupSchema.meta({ id: "BackupDto" });
export type BackupDto = Infer<typeof BackupDto>;

export const currentOrganizationBackupResponseSchema = z.object({
  backup: backupSchema.nullable(),
});

export const CurrentBackupResponseDto =
  currentOrganizationBackupResponseSchema.meta({
    id: "CurrentBackupResponseDto",
  });
export type CurrentBackupResponseDto = Infer<typeof CurrentBackupResponseDto>;

export const backupDownloadResponseSchema = z.object({
  downloadUrl: z.string().url(),
  expiresAt: z.string(),
  filename: z.string(),
});

export const BackupDownloadResponseDto = backupDownloadResponseSchema.meta({
  id: "BackupDownloadResponseDto",
});
export type BackupDownloadResponseDto = Infer<typeof BackupDownloadResponseDto>;
