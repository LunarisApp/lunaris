import { describe, expect, it, vi } from "vitest";
import {
  buildFileAttachmentQuery,
  createFileAttachmentWatcher,
  FILE_ACCEPT,
  getFileExtension,
  getFileMediaType,
  getFileMetadataValue,
  queueFileAttachmentDeletion,
} from "./services";

describe("file helpers", () => {
  it("maps allowed MIME types to attachment extensions", () => {
    expect(getFileExtension("application/pdf", "x.pdf")).toBe("pdf");
    expect(getFileExtension("image/jpeg", "x.jpeg")).toBe("jpg");
    expect(getFileExtension("application/json", "x.json")).toBe("json");
    expect(
      getFileExtension(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x.docx"
      )
    ).toBe("docx");
    expect(getFileExtension("", "notes.md")).toBe("md");
    expect(
      getFileExtension("application/vnd.example.extension-data", "data.custom")
    ).toBe("custom");
    expect(getFileExtension("application/octet-stream", "unsafe.bad/ext")).toBe(
      "bin"
    );
    expect(getFileExtension("text/html", "app.htm")).toBe("html");
    expect(getFileMediaType("", "app.html")).toBe("text/html");
    expect(getFileMediaType("", "notes.md")).toBe("text/markdown");
    expect(getFileMediaType("application/octet-stream", "notes.markdown")).toBe(
      "text/markdown"
    );
    expect(getFileMediaType("application/octet-stream", "data.bin")).toBe(
      "application/octet-stream"
    );
    expect(FILE_ACCEPT).toContain(".csv");
    expect(FILE_ACCEPT).toContain(".docx");
    expect(FILE_ACCEPT).toContain(".pptx");
    expect(FILE_ACCEPT).toContain(".xlsx");
  });

  it("builds viewer query against file metadata and attachment queue", () => {
    const query = buildFileAttachmentQuery("item_1");

    expect(query.params).toEqual(["", "", "item_1"]);
    expect(query.query).toContain("FROM workspace_storage_slots");
    expect(query.query).toContain("LEFT JOIN attachments");
    expect(query.query).toContain(
      "json_extract(slot.metadata, '$.attachmentId')"
    );
  });

  it("reads canonical slot metadata", async () => {
    let capturedQuery = "";
    const db = {
      getOptional: (query: string) => {
        capturedQuery = query;
        return Promise.resolve({
          value: JSON.stringify({
            attachmentId: "att_1",
            fileExtension: "png",
            filename: "image.png",
            mediaType: "image/png",
            size: 10,
            uploadedAt: "2026-01-01T00:00:00.000Z",
          }),
        });
      },
    };

    const metadata = await getFileMetadataValue({
      db: db as never,
      resourceId: "item_1",
      workspaceId: "workspace_1",
    });

    expect(metadata?.attachmentId).toBe("att_1");
    expect(capturedQuery).toContain("FROM workspace_storage_slots");
    expect(capturedQuery).not.toContain("workspace_data");
  });

  it("watches only attachments referenced by live file items", async () => {
    let capturedQuery = "";
    let capturedParams: unknown[] = [];
    let capturedAttachments: Array<{ metaData?: string }> = [];
    const metadata = {
      attachmentId: "att_1",
      fileExtension: "png",
      filename: "image.png",
      mediaType: "image/png",
      size: 42,
      uploadedAt: "2026-01-01T00:00:00.000Z",
    };
    const updated = new Promise<void>((resolve) => {
      const watcher = createFileAttachmentWatcher({
        db: {
          async *watch(query: string, params: unknown[]) {
            capturedQuery = query;
            capturedParams = params;
            yield { rows: { _array: [{ value: JSON.stringify(metadata) }] } };
          },
        } as never,
        workspaceId: "workspace_1",
      });
      watcher(async (attachments) => {
        capturedAttachments = attachments;
        resolve();
      }, new AbortController().signal);
    });

    await updated;

    expect(capturedQuery).toContain("FROM workspace_storage_slots");
    expect(capturedQuery).toContain("slot.metadata AS value");
    expect(capturedQuery).toContain("a.state IS NULL OR a.state != ?");
    expect(capturedParams).toEqual(["workspace_1", 4]);
    expect(JSON.parse(capturedAttachments[0]?.metaData ?? "")).toEqual({
      fileExtension: "png",
      filename: "image.png",
      mediaType: "image/png",
      workspaceId: "workspace_1",
    });
  });

  it("queues file deletion in local attachment outbox", async () => {
    const execute = vi.fn(() => Promise.resolve());

    await queueFileAttachmentDeletion({
      db: { execute } as never,
      metadata: {
        attachmentId: "att_1",
        fileExtension: "docx",
        filename: "draft.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 42,
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      workspaceId: "workspace_1",
    });

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("INSERT OR IGNORE INTO attachments"),
      expect.arrayContaining(["att_1", "att_1.docx", 42, 2])
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SET state = ?, has_synced = 0, meta_data = ?"),
      [
        2,
        JSON.stringify({
          fileExtension: "docx",
          filename: "draft.docx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          workspaceId: "workspace_1",
        }),
        "att_1",
      ]
    );
  });
});
