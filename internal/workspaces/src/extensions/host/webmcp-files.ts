import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { readAttachmentFile } from "@repo/data/features/attachments";
import { getFileMetadataValue } from "@repo/data/features/files";

const MAX_TEXT_BYTES = 1024 * 1024;
const TEXT_MIME =
  /^(text\/|application\/(json|xml|javascript|yaml|x-yaml)(;|$))/i;

/** Reads cached attachments only; never follows agent-supplied URLs or paths. */
export async function readWebMcpFile(
  db: AbstractPowerSyncDatabase,
  workspaceId: string,
  resourceId: string
) {
  const metadata = await getFileMetadataValue({ db, workspaceId, resourceId });
  if (!metadata) {
    throw new Error("Resource has no file metadata.");
  }
  if (!TEXT_MIME.test(metadata.mediaType)) {
    return { metadata, text: null, textStatus: "unsupported_format" };
  }
  if (metadata.size > MAX_TEXT_BYTES) {
    return { metadata, text: null, textStatus: "too_large" };
  }
  const attachment = await db.getOptional<{ local_uri: string | null }>(
    "SELECT local_uri FROM attachments WHERE id = ? AND json_extract(meta_data, '$.workspaceId') = ? LIMIT 1",
    [metadata.attachmentId, workspaceId]
  );
  if (!attachment?.local_uri) {
    return { metadata, text: null, textStatus: "not_cached" };
  }
  const bytes = await readAttachmentFile({
    localUri: attachment.local_uri,
    workspaceId,
  });
  if (bytes.byteLength > MAX_TEXT_BYTES) {
    return { metadata, text: null, textStatus: "too_large" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) {
      return { metadata, text: null, textStatus: "invalid_text" };
    }
    return { metadata, text, textStatus: "available" };
  } catch {
    return { metadata, text: null, textStatus: "invalid_text" };
  }
}
