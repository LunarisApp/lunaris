import type { PluginResourceReadContext } from "@lunarisapp/plugin-sdk";
import { createError } from "evlog";
import { getI18n } from "react-i18next";
import {
  compileBlockNoteBlocks,
  compileBlockNoteDocument,
  compileBlockNoteMarkdown,
} from "./yjs-compile";

const REVOKE_DELAY_MS = 10_000;

export function sanitizeDocumentName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "document"
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export async function exportDocumentAsMarkdown(
  context: PluginResourceReadContext,
  resourceId: string,
  documentName: string
): Promise<void> {
  const markdown = await compileBlockNoteMarkdown(context, resourceId);
  downloadBlob(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    `${sanitizeDocumentName(documentName)}.md`
  );
}

export async function exportDocumentAsPdf(
  context: PluginResourceReadContext,
  resourceId: string,
  documentName: string
): Promise<void> {
  const content = await compileBlockNoteDocument(context, resourceId);
  const { generatePdf } = await import("./pdf/generator");
  const result = await generatePdf([content], documentName);

  if (!result.success) {
    throw createError({
      message: "Failed to export PDF",
      why: result.error ?? "PDF renderer did not return a file",
      fix: "Try exporting the document again",
    });
  }
}

export async function exportResourceAsDocx(
  context: PluginResourceReadContext,
  resourceId: string,
  resourceName: string
): Promise<{ missingImages: number }> {
  const blocks = await compileBlockNoteBlocks(context, resourceId);
  const { generateDocx } = await import("./docx/generator");
  const result = await generateDocx(blocks, resourceName, {
    missingImage: getI18n().t(
      "extensions.catalog.lunaris.rich-text.exportDocxMissingImage",
      {
        defaultValue: "Image unavailable",
      }
    ),
  });
  downloadBlob(result.blob, `${sanitizeDocumentName(resourceName)}.docx`);
  return { missingImages: result.missingImages };
}
