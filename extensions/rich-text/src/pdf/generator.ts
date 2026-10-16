import { runPluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import type { PdfContent } from "./content";
import { downloadBlob } from "./download";
import { preparePdfEmojiDataUrls } from "./emoji";
import { DEFAULT_PDF_THEME, type PdfTheme } from "./theme";
import type { PdfRenderResult } from "./renderer";
import type { PdfWorkerInput } from "./worker-protocol";

const PDF_WORKER_TIMEOUT_MS = 60_000;

export interface PdfGenerationResult {
  error?: string;
  success: boolean;
}

function createPdfWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), {
    name: "lunaris-rich-text-pdf",
    type: "module",
  });
}

export async function generatePdf(
  contents: PdfContent[],
  workspaceName: string,
  theme: PdfTheme = DEFAULT_PDF_THEME,
  noContentLabel = "(No content)"
): Promise<PdfGenerationResult> {
  if (contents.length === 0) {
    return { success: false, error: "No content to compile" };
  }

  try {
    const result = await runPluginWorkerTask<PdfWorkerInput, PdfRenderResult>(
      createPdfWorker,
      {
        contents,
        emojiDataUrls: preparePdfEmojiDataUrls(contents),
        noContentLabel,
        workspaceName,
        theme,
      },
      { timeoutMs: PDF_WORKER_TIMEOUT_MS }
    );
    if (!(result.success && result.data && result.filename)) {
      return {
        success: false,
        error: result.error ?? "PDF renderer did not return a file",
      };
    }
    downloadBlob(
      new Blob([result.data], { type: "application/pdf" }),
      result.filename
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate PDF file",
    };
  }
}
