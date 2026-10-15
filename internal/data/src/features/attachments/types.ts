export interface AttachmentRow {
  has_synced?: number | null;
  id: string;
  local_uri?: string | null;
  media_type?: string | null;
  state?: number | null;
}

export interface AttachmentRowWithValue extends AttachmentRow {
  value?: string | null;
}

export interface StoredAttachmentMetadata {
  attachmentId: string;
  fileExtension?: string;
  filename: string;
  mediaType: string;
}
