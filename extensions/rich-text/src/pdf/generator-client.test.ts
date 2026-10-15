import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
  prepareEmoji: vi.fn(() => ({ "1f600": "data:image/png;base64,emoji" })),
  runTask: vi.fn(),
}));

vi.mock("@lunarisapp/plugin-sdk/worker", () => ({
  runPluginWorkerTask: mocks.runTask,
}));
vi.mock("./download", () => ({
  buildExportFilename: vi.fn(),
  downloadBlob: mocks.downloadBlob,
}));
vi.mock("./emoji", () => ({
  preparePdfEmojiDataUrls: mocks.prepareEmoji,
}));

import { generatePdf } from "./generator";
import { DEFAULT_PDF_THEME } from "./theme";

const contents = [
  {
    sections: [{ text: "Hello 😀", type: "paragraph" as const }],
    title: "Notes",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runTask.mockResolvedValue({
    data: new TextEncoder().encode("pdf").buffer,
    filename: "workspace-export.pdf",
    success: true,
  });
});

describe("PDF worker client", () => {
  it("prepares emoji, runs an isolated task, and downloads returned bytes", async () => {
    await expect(generatePdf(contents, "Workspace")).resolves.toEqual({
      success: true,
    });

    expect(mocks.prepareEmoji).toHaveBeenCalledWith(contents);
    expect(mocks.runTask).toHaveBeenCalledWith(
      expect.any(Function),
      {
        contents,
        emojiDataUrls: { "1f600": "data:image/png;base64,emoji" },
        noContentLabel: "(No content)",
        workspaceName: "Workspace",
        theme: DEFAULT_PDF_THEME,
      },
      { timeoutMs: 60_000 },
    );
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "workspace-export.pdf",
    );
  });

  it("does not start a worker for empty content", async () => {
    await expect(generatePdf([], "Workspace")).resolves.toEqual({
      error: "No content to compile",
      success: false,
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it("reports worker and invalid renderer failures", async () => {
    mocks.runTask.mockRejectedValueOnce(new Error("Worker crashed"));
    await expect(generatePdf(contents, "Workspace")).resolves.toEqual({
      error: "Worker crashed",
      success: false,
    });

    mocks.runTask.mockResolvedValueOnce({ success: true });
    await expect(generatePdf(contents, "Workspace")).resolves.toEqual({
      error: "PDF renderer did not return a file",
      success: false,
    });
  });
});
