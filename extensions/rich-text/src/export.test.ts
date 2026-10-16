import type { PluginResourceReadContext } from "@lunarisapp/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compileDocument: vi.fn(),
  compileBlocks: vi.fn(),
  generateDocx: vi.fn(),
  compileMarkdown: vi.fn(),
  generatePdf: vi.fn(),
}));

vi.mock("./yjs-compile", () => ({
  compileBlockNoteDocument: mocks.compileDocument,
  compileBlockNoteBlocks: mocks.compileBlocks,
  compileBlockNoteMarkdown: mocks.compileMarkdown,
}));

vi.mock("./pdf/generator", () => ({
  generatePdf: mocks.generatePdf,
}));

vi.mock("./docx/generator", () => ({ generateDocx: mocks.generateDocx }));
vi.mock("react-i18next", () => ({
  getI18n: () => ({
    t: (_key: string, options: { defaultValue: string }) =>
      options.defaultValue,
  }),
}));

import {
  exportResourceAsDocx,
  exportDocumentAsMarkdown,
  exportDocumentAsPdf,
  sanitizeDocumentName,
} from "./export";

const db = { getAll: vi.fn() } as unknown as PluginResourceReadContext;
const click = vi.fn();
const link = { click, download: "", href: "" };

beforeEach(() => {
  mocks.compileMarkdown.mockResolvedValue("# Hello\n");
  mocks.compileDocument.mockResolvedValue({
    title: "",
    sections: [{ type: "paragraph", text: "Hello" }],
  });
  mocks.generatePdf.mockResolvedValue({ success: true });
  vi.spyOn(document, "createElement").mockReturnValue(link as never);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:export"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  click.mockReset();
  link.download = "";
  link.href = "";
});

describe("rich-text export", () => {
  it("builds safe filenames", () => {
    expect(sanitizeDocumentName(" Résumé Draft! ")).toBe("resume-draft");
    expect(sanitizeDocumentName("!!!")).toBe("document");
  });

  it("downloads BlockNote Markdown", async () => {
    await exportDocumentAsMarkdown(db, "doc-1", "Workspace Notes");

    expect(mocks.compileMarkdown).toHaveBeenCalledWith(db, "doc-1");
    expect(link.download).toBe("workspace-notes.md");
    expect(link.href).toBe("blob:export");
    expect(click).toHaveBeenCalledOnce();
  });

  it("generates one-document PDF", async () => {
    await exportDocumentAsPdf(db, "doc-1", "Workspace Notes");

    expect(mocks.compileDocument).toHaveBeenCalledWith(db, "doc-1");
    expect(mocks.generatePdf).toHaveBeenCalledWith(
      [
        {
          title: "",
          sections: [{ type: "paragraph", text: "Hello" }],
        },
      ],
      "Workspace Notes"
    );
  });

  it("reports PDF generation failures", async () => {
    mocks.generatePdf.mockResolvedValue({
      success: false,
      error: "Renderer failed",
    });

    await expect(
      exportDocumentAsPdf(db, "doc-1", "Workspace Notes")
    ).rejects.toMatchObject({
      message: "Failed to export PDF",
      why: "Renderer failed",
    });
  });
  it("downloads DOCX and releases its URL", async () => {
    vi.useFakeTimers();
    const blob = new Blob(["docx"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    mocks.compileBlocks.mockResolvedValue([]);
    mocks.generateDocx.mockResolvedValue({ blob, missingImages: 2 });
    try {
      await expect(
        exportResourceAsDocx(db, "doc-1", "Résumé Notes")
      ).resolves.toEqual({ missingImages: 2 });
      expect(mocks.compileBlocks).toHaveBeenCalledWith(db, "doc-1");
      expect(mocks.generateDocx).toHaveBeenCalledWith([], "Résumé Notes", {
        missingImage: "Image unavailable",
      });
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(link.download).toBe("resume-notes.docx");
      expect(click).toHaveBeenCalledOnce();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:export");
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates DOCX generation failures without downloading", async () => {
    mocks.compileBlocks.mockResolvedValue([]);
    mocks.generateDocx.mockRejectedValueOnce(new Error("Packing failed"));
    await expect(exportResourceAsDocx(db, "doc-1", "Notes")).rejects.toThrow(
      "Packing failed"
    );
    expect(click).not.toHaveBeenCalled();
  });
});
