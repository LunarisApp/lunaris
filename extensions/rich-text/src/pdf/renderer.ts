import "./setup-buffer";
import { pdf } from "@react-pdf/renderer";
import type { PdfContent } from "./content";
import { renderDocument } from "./document";
import { buildExportFilename } from "./download";
import { registerPdfEmojiSource, type PdfEmojiDataUrls } from "./emoji";
import { DEFAULT_PDF_THEME, type PdfTheme } from "./theme";

export interface PdfRenderResult {
  data?: ArrayBuffer;
  error?: string;
  filename?: string;
  success: boolean;
}

export async function renderPdf(
  contents: PdfContent[],
  workspaceName: string,
  theme: PdfTheme = DEFAULT_PDF_THEME,
  noContentLabel = "(No content)",
  emojiDataUrls?: PdfEmojiDataUrls,
): Promise<PdfRenderResult> {
  if (contents.length === 0) {
    return { success: false, error: "No content to compile" };
  }

  try {
    registerPdfEmojiSource(emojiDataUrls);
    const doc = renderDocument(contents, theme, noContentLabel);
    // react-pdf typings don't line up with the inferred ReactElement.
    // biome-ignore lint/suspicious/noExplicitAny: interop shim
    const blob = await pdf(doc as any).toBlob();
    return {
      data: await blob.arrayBuffer(),
      filename: buildExportFilename(workspaceName),
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate PDF file",
    };
  }
}
