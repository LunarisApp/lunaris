export const FILE_PLUGIN_ID = "lunaris.file";
export const FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json,application/xml,text/xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.txt,.md,.xml,.json,.csv,.docx,.pptx,.xlsx";
export const MIME_TO_EXTENSION: Record<string, string> = {
  "application/json": "json",
  "application/xml": "xml",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "text/xml": "xml",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  json: "application/json",
  markdown: "text/markdown",
  md: "text/markdown",
  htm: "text/html",
  html: "text/html",
  txt: "text/plain",
  xml: "application/xml",
};

const SAFE_FILE_EXTENSION = /^[a-z0-9]{1,32}$/;

export function getFileExtension(mediaType: string, filename: string) {
  const mapped = MIME_TO_EXTENSION[mediaType];
  if (mapped) {
    return mapped;
  }
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && SAFE_FILE_EXTENSION.test(ext) ? ext : "bin";
}

export function getFileMediaType(mediaType: string, filename: string) {
  if (mediaType && mediaType !== "application/octet-stream") {
    return mediaType;
  }
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    EXTENSION_TO_MIME[extension] ?? (mediaType || "application/octet-stream")
  );
}
