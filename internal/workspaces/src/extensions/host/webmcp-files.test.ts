import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { readWebMcpFile } from "./webmcp-files";
const mocks = vi.hoisted(() => ({
  metadata: vi.fn(),
  bytes: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@repo/data/features/files", () => ({
  getFileMetadataValue: mocks.metadata,
}));
vi.mock("@repo/data/features/attachments", () => ({
  readAttachmentFile: mocks.bytes,
}));
const db = { getOptional: mocks.get } as unknown as AbstractPowerSyncDatabase;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.metadata.mockResolvedValue({
    attachmentId: "file-1",
    filename: "notes.txt",
    mediaType: "text/plain",
    size: 5,
  });
  mocks.get.mockResolvedValue({ local_uri: "cached-file" });
  mocks.bytes.mockResolvedValue(new TextEncoder().encode("Hello").buffer);
});
describe("WebMCP cached file reads", () => {
  it("reads text using workspace-owned attachment paths", async () => {
    await expect(
      readWebMcpFile(db, "workspace-1", "resource-1")
    ).resolves.toMatchObject({ text: "Hello", textStatus: "available" });
    expect(mocks.get.mock.calls[0]?.[1]).toEqual(["file-1", "workspace-1"]);
    expect(mocks.bytes).toHaveBeenCalledWith({
      localUri: "cached-file",
      workspaceId: "workspace-1",
    });
  });
  it("returns metadata without reading unsupported files or oversized content", async () => {
    mocks.metadata.mockResolvedValueOnce({
      mediaType: "application/pdf",
      size: 10,
    });
    await expect(
      readWebMcpFile(db, "workspace-1", "resource-1")
    ).resolves.toMatchObject({ textStatus: "unsupported_format" });
    mocks.metadata.mockResolvedValueOnce({
      mediaType: "text/plain",
      size: 1024 * 1024 + 1,
    });
    await expect(
      readWebMcpFile(db, "workspace-1", "resource-1")
    ).resolves.toMatchObject({ textStatus: "too_large" });
    expect(mocks.bytes).not.toHaveBeenCalled();
  });
  it("handles uncached bytes and rejects binary content mislabeled as text", async () => {
    mocks.get.mockResolvedValueOnce(null);
    await expect(
      readWebMcpFile(db, "workspace-1", "resource-1")
    ).resolves.toMatchObject({ textStatus: "not_cached" });
    mocks.bytes.mockResolvedValueOnce(new Uint8Array([255]).buffer);
    await expect(
      readWebMcpFile(db, "workspace-1", "resource-1")
    ).resolves.toMatchObject({ textStatus: "invalid_text" });
    mocks.bytes.mockResolvedValueOnce(new Uint8Array([0]).buffer);
    await expect(
      readWebMcpFile(db, "workspace-1", "resource-1")
    ).resolves.toMatchObject({ textStatus: "invalid_text" });
  });
});
