export const RICH_TEXT_PLUGIN_ID = "lunaris.rich-text";

export const RICH_TEXT_BLOCK_TYPES = [
  "audio",
  "bulletListItem",
  "checkListItem",
  "codeBlock",
  "divider",
  "file",
  "heading",
  "image",
  "numberedListItem",
  "paragraph",
  "quote",
  "table",
  "toggleListItem",
  "video",
] as const;

export const RICH_TEXT_MAX_DOCUMENT_BLOCKS = 2000;
export const RICH_TEXT_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
