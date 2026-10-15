import type { AttachmentRow } from "../attachments";

export interface FileMetadata {
  attachmentId: string;
  fileExtension: string;
  filename: string;
  mediaType: string;
  size: number;
  uploadedAt: string;
}

export type FileAttachmentRow = AttachmentRow;
