import type { PdfContent } from "./content";
import type { PdfEmojiDataUrls } from "./emoji";
import type { PdfTheme } from "./theme";

export interface PdfWorkerInput {
  contents: PdfContent[];
  emojiDataUrls: PdfEmojiDataUrls;
  noContentLabel: string;
  theme: PdfTheme;
  workspaceName: string;
}
