export const ATTACHMENTS_TABLE = "attachments";

const ATTACHMENT_STORAGE_DB_PREFIX = "lunaris-files-";

export function getAttachmentStorageDatabaseName(workspaceId: string) {
  return `${ATTACHMENT_STORAGE_DB_PREFIX}${workspaceId}`;
}

export const getFileStorageDatabaseName = getAttachmentStorageDatabaseName;
