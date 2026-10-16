import { HttpException } from "@nestjs/common";
import type { Part } from "@aws-sdk/client-s3";

export const UPLOAD_PART_BYTES = 16 * 1024 * 1024;
export const UPLOAD_SESSION_MS = 24 * 60 * 60 * 1000;

export function storageError(
  code: string,
  message: string,
  status = 409
): never {
  throw new HttpException({ code, message, statusCode: status }, status);
}

export function assertStorageCapacity(params: {
  size: number;
  credit: number;
  committed: number;
  reserved: number;
  maxStorage: number;
  maxFile: number;
}) {
  if (params.size > params.maxFile) {
    storageError(
      "FILE_TOO_LARGE",
      "File exceeds your plan’s maximum file size",
      413
    );
  }
  const growth = Math.max(0, params.size - params.credit);
  if (
    growth > 0 &&
    params.committed + params.reserved + growth > params.maxStorage
  ) {
    storageError(
      "STORAGE_QUOTA_EXCEEDED",
      "Organization storage is full. Free space or upgrade to upload this file",
      413
    );
  }
  return growth;
}

export function partLength(size: number, partNumber: number) {
  const count = Math.max(1, Math.ceil(size / UPLOAD_PART_BYTES));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count) {
    storageError("INVALID_UPLOAD_PART", "Invalid upload part number", 400);
  }
  return Math.min(
    UPLOAD_PART_BYTES,
    Math.max(0, size - (partNumber - 1) * UPLOAD_PART_BYTES)
  );
}

export function verifyUploadParts(size: number, parts: Part[]) {
  if (parts.length !== Math.max(1, Math.ceil(size / UPLOAD_PART_BYTES))) {
    storageError(
      "INVALID_UPLOAD_PARTS",
      "Upload has missing or extra parts",
      400
    );
  }
  for (const [index, part] of parts.entries()) {
    if (
      !part.ETag ||
      part.PartNumber !== index + 1 ||
      part.Size !== partLength(size, index + 1)
    ) {
      storageError(
        "INVALID_UPLOAD_PARTS",
        "Upload part size or order is incorrect",
        400
      );
    }
  }
}
