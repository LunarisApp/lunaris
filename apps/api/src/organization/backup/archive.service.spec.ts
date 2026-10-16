import { describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import * as unzipper from "unzipper";
import { ArchiveService, MissingBackupFileError } from "./archive.service";

const FILE_BYTES = new TextEncoder().encode("<h1>Mini App</h1>");

function makeDatabase(objectKey?: string) {
  const client = {
    query: mock((input: string | { cursor?: { text?: string } }) => {
      if (typeof input === "string") {
        if (input.includes("FROM organization")) {
          return Promise.resolve({
            rows: [
              {
                id: "org_1",
                name: "Acme",
                slug: "acme",
                logo: null,
                created_at: new Date("2026-07-15T10:00:00.000Z"),
                metadata: null,
                is_personal: false,
                yjs_retention_days: 7,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }

      const sql = input.cursor?.text ?? "";
      if (
        sql.includes(
          "SELECT slot.id, slot.workspace_id, slot.metadata AS value"
        )
      ) {
        return Readable.from([
          {
            id: "storage_1",
            workspace_id: "workspace_1",
            object_key: objectKey,
            value: JSON.stringify({
              attachmentId: "att_1",
              fileExtension: "html",
            }),
          },
        ]);
      }
      return Readable.from([]);
    }),
    release: mock(() => undefined),
  };
  return {
    pool: { connect: mock(() => Promise.resolve(client)) },
  };
}

function makeStorage(
  includeFile: boolean,
  objectKey = "files/org_1/workspace_1/att_1.html"
) {
  const uploaded: Uint8Array[] = [];
  const deleteObject = mock(() => Promise.resolve());
  return {
    deleteObject,
    uploaded,
    async getObjectStream() {
      return new Blob([FILE_BYTES]).stream();
    },
    async *listObjects() {
      if (!includeFile) {
        return;
      }
      yield {
        key: objectKey,
        lastModified: Date.now(),
        size: FILE_BYTES.byteLength,
        type: "text/html",
      };
      yield {
        key: "files/org_1/private-workspace/secret.txt",
        lastModified: Date.now(),
        size: FILE_BYTES.byteLength,
        type: "text/plain",
      };
    },
    async putObjectStream(_key: string, body: ReadableStream<Uint8Array>) {
      for await (const chunk of body) {
        uploaded.push(chunk);
      }
      return {
        size: uploaded.reduce((size, chunk) => size + chunk.byteLength, 0),
      };
    },
  };
}

describe("ArchiveService", () => {
  it("keeps logical archive paths for immutable multipart objects", async () => {
    await expectArchive("files/org_1/workspace_1/att_1/immutable-attempt");
  });

  async function expectArchive(objectKey?: string) {
    const storage = makeStorage(true, objectKey);
    const service = new ArchiveService(
      makeDatabase(objectKey) as never,
      storage as never
    );

    const result = await service.createArchive({
      backupId: "backup_1",
      organizationId: "org_1",
      onProgress: mock(() => undefined),
    });

    const bytes = Buffer.concat(
      storage.uploaded.map((chunk) => Buffer.from(chunk))
    );
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(result.archiveSizeBytes).toBe(bytes.byteLength);
    expect(result.filename).toStartWith("acme-backup-");
    expect(result.objectKey).toBe("backups/org_1/backup_1.zip");

    const directory = await unzipper.Open.buffer(bytes);
    const files = new Map(directory.files.map((file) => [file.path, file]));
    expect([...files.keys()].sort()).toEqual([
      "data/members.ndjson",
      "data/organization.json",
      "data/team_members.ndjson",
      "data/teams.ndjson",
      "data/workspace_extensions.ndjson",
      "data/workspace_resource_trash.ndjson",
      "data/workspace_resources.ndjson",
      "data/workspace_storage_slots.ndjson",
      "data/workspace_storage_values.ndjson",
      "data/workspaces.ndjson",
      "data/yjs_document_updates.ndjson",
      "data/yjs_documents.ndjson",
      "integrity.ndjson",
      "manifest.json",
      "objects/files/org_1/workspace_1/att_1.html",
    ]);
    expect(
      new Uint8Array(
        await files.get("objects/files/org_1/workspace_1/att_1.html")!.buffer()
      )
    ).toEqual(FILE_BYTES);

    const organization = JSON.parse(
      (await files.get("data/organization.json")!.buffer()).toString()
    );
    expect(organization).toEqual({
      created_at: "2026-07-15T10:00:00.000Z",
      id: "org_1",
      is_personal: false,
      logo: null,
      metadata: null,
      name: "Acme",
      slug: "acme",
      yjs_retention_days: 7,
    });

    const integrity = (await files.get("integrity.ndjson")!.buffer())
      .toString()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(integrity).toContainEqual({
      path: "objects/files/org_1/workspace_1/att_1.html",
      sha256: createHash("sha256").update(FILE_BYTES).digest("hex"),
      size: FILE_BYTES.byteLength,
    });

    const manifest = JSON.parse(
      (await files.get("manifest.json")!.buffer()).toString()
    );
    expect(manifest).toMatchObject({
      backup_id: "backup_1",
      datasets: [
        "organization",
        "members",
        "teams",
        "team_members",
        "workspaces",
        "workspace_resources",
        "workspace_resource_trash",
        "workspace_extensions",
        "workspace_storage_slots",
        "workspace_storage_values",
        "yjs_documents",
        "yjs_document_updates",
        "storage_objects",
      ],
      exclusions: [
        "account_credentials",
        "billing",
        "invitations",
        "sessions",
        "unsynced_device_data",
      ],
      format: "lunaris.organization-backup",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      storage_object_count: 1,
      version: 2,
    });
  }

  it.each(["lunaris.file", "lunaris.mini-app"])(
    "streams exact cloud bytes for %s attachments",
    expectArchive
  );

  it("fails and deletes partial output when referenced file is missing", async () => {
    const storage = makeStorage(false);
    const service = new ArchiveService(
      makeDatabase() as never,
      storage as never
    );

    await expect(
      service.createArchive({
        backupId: "backup_1",
        organizationId: "org_1",
        onProgress: mock(() => undefined),
      })
    ).rejects.toBeInstanceOf(MissingBackupFileError);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      "backups/org_1/backup_1.zip"
    );
  });
});
