import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { DatabaseService } from "@app/db";
import { StorageService } from "@app/storage";
import { Injectable } from "@nestjs/common";
import * as archiver from "archiver";
import type { StoredFile } from "files-sdk";
import type { PoolClient } from "pg";
import QueryStream from "pg-query-stream";

const SAFE_STORAGE_SEGMENT = /^[a-zA-Z0-9._-]+$/;
const WORKSPACE_ACCESS_SQL = `p.organization_id = $1
      AND (
        p.visibility = 'shared'
        OR (p.visibility = 'private' AND p.owner_id = $2)
      )`;

type ArchiveProgress = {
  phase: "snapshotting" | "archiving" | "finalizing";
  processedFiles: number;
  totalFiles: number | null;
  processedBytes: number;
  totalBytes: number | null;
};

type IntegrityRecord = {
  path: string;
  sha256: string;
  size: number;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  created_at: Date;
  metadata: string | null;
  is_personal: boolean;
  yjs_retention_days: number;
};

const DATASETS = [
  {
    path: "data/members.ndjson",
    userScoped: false,
    sql: `SELECT
      m.id, m.organization_id, m.user_id, m.role, m.created_at,
      u.name AS user_name, u.email AS user_email, u.image AS user_image
    FROM member m
    INNER JOIN "user" u ON u.id = m.user_id
    WHERE m.organization_id = $1
    ORDER BY m.id`,
  },
  {
    path: "data/teams.ndjson",
    userScoped: false,
    sql: `SELECT id, name, organization_id, created_at, updated_at
    FROM team
    WHERE organization_id = $1
    ORDER BY id`,
  },
  {
    path: "data/team_members.ndjson",
    userScoped: false,
    sql: `SELECT tm.id, tm.team_id, tm.user_id, tm.created_at
    FROM team_member tm
    INNER JOIN team t ON t.id = tm.team_id
    WHERE t.organization_id = $1
    ORDER BY tm.id`,
  },
  {
    path: "data/workspaces.ndjson",
    userScoped: true,
    sql: `SELECT
      id, name, slug, organization_id, owner_id, visibility, created_at, updated_at,
      synced_created_at, synced_updated_at
    FROM workspaces p
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY id`,
  },
  {
    path: "data/workspace_resources.ndjson",
    userScoped: true,
    sql: `SELECT
      pi.id, pi.workspace_id, pi.name, pi.icon, pi.position, pi.parent_id,
      pi.resource_type_id, pi.schema_version,
      pi.created_at, pi.updated_at,
      pi.synced_created_at, pi.synced_updated_at
    FROM workspace_resources pi
    INNER JOIN workspaces p ON p.id = pi.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY pi.id`,
  },
  {
    path: "data/workspace_resource_trash.ndjson",
    userScoped: true,
    sql: `SELECT
      trash.id, trash.workspace_id, trash.trash_root_id, trash.trashed_at,
      trash.purge_at, trash.synced_created_at, trash.synced_updated_at
    FROM workspace_resource_trash trash
    INNER JOIN workspaces p ON p.id = trash.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY trash.id`,
  },
  {
    path: "data/workspace_extensions.ndjson",
    userScoped: true,
    sql: `SELECT
      extension.id, extension.workspace_id, extension.extension_id, extension.enabled,
      extension.registry_id, extension.version, extension.descriptor_url,
      extension.descriptor_bytes, extension.descriptor_sha256,
      extension.created_at, extension.updated_at,
      extension.synced_created_at, extension.synced_updated_at
    FROM workspace_extensions extension
    INNER JOIN workspaces p ON p.id = extension.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY extension.id`,
  },
  {
    path: "data/workspace_storage_slots.ndjson",
    userScoped: true,
    sql: `SELECT
      storage.id, storage.workspace_id, storage.resource_id, storage.plugin_id,
      storage.name, storage.kind, storage.backing_id, storage.metadata,
      storage.created_at, storage.updated_at,
      storage.synced_created_at, storage.synced_updated_at
    FROM workspace_storage_slots storage
    INNER JOIN workspaces p ON p.id = storage.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY storage.id`,
  },
  {
    path: "data/workspace_storage_values.ndjson",
    userScoped: true,
    sql: `SELECT
      value.id, value.storage_id, value.workspace_id, value.key, value.value,
      value.created_at, value.updated_at,
      value.synced_created_at, value.synced_updated_at
    FROM workspace_storage_values value
    INNER JOIN workspaces p ON p.id = value.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY value.id`,
  },
  {
    path: "data/yjs_documents.ndjson",
    userScoped: true,
    sql: `SELECT
      yd.id, yd.workspace_id, yd.created_at, yd.updated_at,
      yd.synced_created_at, yd.synced_updated_at
    FROM yjs_documents yd
    INNER JOIN workspaces p ON p.id = yd.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY yd.id`,
  },
  {
    path: "data/yjs_document_updates.ndjson",
    userScoped: true,
    sql: `SELECT
      ydu.id, ydu.workspace_id, ydu.document_id, ydu.user_id,
      encode(ydu.update_data, 'base64') AS update_b64,
      ydu.created_at, ydu.updated_at, ydu.synced_created_at,
      ydu.synced_updated_at
    FROM yjs_document_updates ydu
    INNER JOIN workspaces p ON p.id = ydu.workspace_id
    WHERE ${WORKSPACE_ACCESS_SQL}
    ORDER BY ydu.id`,
  },
] as const;

@Injectable()
export class ArchiveService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: StorageService
  ) {}

  async createArchive(params: {
    backupId: string;
    organizationId: string;
    userId?: string;
    onProgress: (progress: ArchiveProgress) => void | Promise<void>;
  }) {
    const snapshotStartedAt = new Date();
    const objectKey = `backups/${params.organizationId}/${params.backupId}.zip`;
    const integrity: IntegrityRecord[] = [];
    const abortController = new AbortController();
    const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
    const archiveStream = Readable.toWeb(
      archive
    ) as unknown as ReadableStream<Uint8Array>;
    const uploadPromise = this.storage.putObjectStream(
      objectKey,
      archiveStream,
      {
        contentType: "application/zip",
        signal: abortController.signal,
      }
    );
    void uploadPromise.catch(() => archive.abort());

    let client: PoolClient | null = null;
    let transactionOpen = false;

    try {
      client = await this.databaseService.pool.connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      transactionOpen = true;

      await params.onProgress({
        phase: "snapshotting",
        processedFiles: 0,
        totalFiles: null,
        processedBytes: 0,
        totalBytes: null,
      });

      const organization = await this.getOrganization(
        client,
        params.organizationId
      );
      const filename = buildBackupFilename(
        organization.slug,
        snapshotStartedAt
      );
      const organizationBody = serializeJson(organization);
      this.appendBuffer(
        archive,
        "data/organization.json",
        organizationBody,
        snapshotStartedAt,
        integrity
      );

      for (const dataset of DATASETS) {
        await this.appendQuery(
          archive,
          client,
          dataset.path,
          dataset.sql,
          dataset.userScoped
            ? [params.organizationId, params.userId ?? null]
            : [params.organizationId],
          snapshotStartedAt,
          integrity
        );
      }

      const referencedFiles = await this.readReferencedFiles(
        client,
        params.organizationId,
        params.userId
      );
      await client.query("COMMIT");
      transactionOpen = false;
      client.release();
      client = null;

      const objects: (StoredFile & { archiveKey: string })[] = [];
      const prefix = `files/${params.organizationId}/`;
      const sources = new Set(referencedFiles.values());
      const available = new Map<string, StoredFile>();
      for await (const object of this.storage.listObjects(prefix)) {
        if (sources.has(object.key)) {
          available.set(object.key, object);
        }
      }
      // Archive paths retain logical file identities even when physical objects
      // use immutable multipart keys or are shared by multiple identities.
      for (const [archiveKey, sourceKey] of referencedFiles) {
        const source = available.get(sourceKey);
        if (!source) {
          throw new MissingBackupFileError(sourceKey);
        }
        objects.push({ ...source, archiveKey });
      }
      objects.sort((left, right) =>
        left.archiveKey.localeCompare(right.archiveKey)
      );

      const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);
      let processedBytes = 0;
      let processedFiles = 0;
      await params.onProgress({
        phase: "archiving",
        processedFiles,
        totalFiles: objects.length,
        processedBytes,
        totalBytes,
      });

      for (const object of objects) {
        const path = archivePathForObject(object.archiveKey, prefix);
        const source = await this.storage.getObjectStream(object.key);
        let currentObjectBytes = 0;
        const hashed = createIntegrityStream(path, integrity, (chunkSize) => {
          currentObjectBytes += chunkSize;
          void Promise.resolve(
            params.onProgress({
              phase: "archiving",
              processedFiles,
              totalFiles: objects.length,
              processedBytes: processedBytes + currentObjectBytes,
              totalBytes,
            })
          ).catch(() => undefined);
        });
        const nodeSource = Readable.fromWeb(
          source as unknown as NodeReadableStream<Uint8Array>
        );
        nodeSource.on("error", (error) => hashed.destroy(error));
        nodeSource.pipe(hashed);
        archive.append(hashed, {
          date: object.lastModified
            ? new Date(object.lastModified)
            : snapshotStartedAt,
          name: path,
          store: shouldStoreWithoutCompression(object.type),
        });
        await finished(hashed);
        if (currentObjectBytes !== object.size) {
          throw new Error("Organization backup source file size changed");
        }
        processedBytes += currentObjectBytes;
        processedFiles += 1;
        await params.onProgress({
          phase: "archiving",
          processedFiles,
          totalFiles: objects.length,
          processedBytes,
          totalBytes,
        });
      }

      await params.onProgress({
        phase: "finalizing",
        processedFiles,
        totalFiles: objects.length,
        processedBytes,
        totalBytes,
      });

      const integrityBody = Buffer.from(
        integrity.map((entry) => JSON.stringify(entry)).join("\n") +
          (integrity.length > 0 ? "\n" : "")
      );
      archive.append(integrityBody, {
        date: snapshotStartedAt,
        name: "integrity.ndjson",
      });

      const snapshotCompletedAt = new Date();
      const manifestBody = serializeJson({
        format: "lunaris.organization-backup",
        version: 2,
        backup_id: params.backupId,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        snapshot_started_at: snapshotStartedAt,
        snapshot_completed_at: snapshotCompletedAt,
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
        storage_object_count: objects.length,
      });
      archive.append(manifestBody, {
        date: snapshotStartedAt,
        name: "manifest.json",
      });

      await archive.finalize();
      const uploaded = await uploadPromise;
      return {
        archiveSizeBytes: uploaded.size,
        fileCount: objects.length,
        filename,
        objectKey,
        snapshotCompletedAt,
      };
    } catch (error) {
      if (transactionOpen && client) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      abortController.abort();
      archive.abort();
      await uploadPromise.catch(() => undefined);
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    } finally {
      client?.release();
    }
  }

  private async getOrganization(client: PoolClient, organizationId: string) {
    const result = await client.query<OrganizationRow>(
      `SELECT id, name, slug, logo, created_at, metadata, is_personal,
        yjs_retention_days
      FROM organization
      WHERE id = $1`,
      [organizationId]
    );
    const organization = result.rows[0];
    if (!organization) {
      throw new Error("Organization not found during backup");
    }
    return organization;
  }

  private async appendQuery(
    archive: archiver.Archiver,
    client: PoolClient,
    path: string,
    sql: string,
    queryParams: unknown[],
    date: Date,
    integrity: IntegrityRecord[]
  ) {
    const query = client.query(
      new QueryStream(sql, queryParams, {
        batchSize: 250,
        highWaterMark: 250,
      })
    );
    const ndjson = new Transform({
      writableObjectMode: true,
      transform(row, _encoding, callback) {
        try {
          callback(null, `${serializeJsonValue(row)}\n`);
        } catch (error) {
          callback(error as Error);
        }
      },
    });
    const hashed = createIntegrityStream(path, integrity);
    query.on("error", (error) => ndjson.destroy(error));
    ndjson.on("error", (error) => hashed.destroy(error));
    query.pipe(ndjson).pipe(hashed);
    archive.append(hashed, { date, name: path });
    await finished(hashed);
  }

  private async readReferencedFiles(
    client: PoolClient,
    organizationId: string,
    userId?: string
  ) {
    const files = new Map<string, string>();
    const query = client.query(
      new QueryStream(
        `SELECT files.workspace_id, files.value, files.object_key
        FROM (
          SELECT slot.id, slot.workspace_id, slot.metadata AS value,
            stored.object_key
          FROM workspace_storage_slots slot
          LEFT JOIN stored_files stored ON stored.workspace_id = slot.workspace_id AND stored.file_id = slot.backing_id
          WHERE slot.kind = 'file' AND slot.metadata IS NOT NULL
        ) files
        INNER JOIN workspaces p ON p.id = files.workspace_id
        WHERE ${WORKSPACE_ACCESS_SQL}
        ORDER BY files.id`,
        [organizationId, userId ?? null],
        { batchSize: 250, highWaterMark: 250 }
      )
    );

    for await (const row of query as AsyncIterable<{
      workspace_id: string;
      value: string;
      object_key?: string;
    }>) {
      const metadata = parseFileMetadata(row.value);
      if (!metadata) {
        continue;
      }
      const identityKey = `files/${organizationId}/${row.workspace_id}/${metadata.attachmentId}.${metadata.fileExtension}`;
      files.set(identityKey, row.object_key ?? identityKey);
    }
    return files;
  }

  private appendBuffer(
    archive: archiver.Archiver,
    path: string,
    body: Buffer,
    date: Date,
    integrity: IntegrityRecord[]
  ) {
    integrity.push({
      path,
      sha256: createHash("sha256").update(body).digest("hex"),
      size: body.byteLength,
    });
    archive.append(body, { date, name: path });
  }
}

export class MissingBackupFileError extends Error {
  constructor(readonly key: string) {
    super("Organization backup source file is missing");
    this.name = "MissingBackupFileError";
  }
}

function createIntegrityStream(
  path: string,
  integrity: IntegrityRecord[],
  onChunk?: (chunkSize: number) => void
) {
  const hash = createHash("sha256");
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      size += chunk.byteLength;
      onChunk?.(chunk.byteLength);
      callback(null, chunk);
    },
    flush(callback) {
      integrity.push({ path, sha256: hash.digest("hex"), size });
      callback();
    },
  });
}

function parseFileMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      attachmentId?: unknown;
      fileExtension?: unknown;
    };
    if (
      typeof parsed.attachmentId !== "string" ||
      typeof parsed.fileExtension !== "string" ||
      !SAFE_STORAGE_SEGMENT.test(parsed.attachmentId) ||
      !SAFE_STORAGE_SEGMENT.test(parsed.fileExtension)
    ) {
      return null;
    }
    return {
      attachmentId: parsed.attachmentId,
      fileExtension: parsed.fileExtension.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function archivePathForObject(key: string, prefix: string) {
  if (!key.startsWith(prefix) || key.split("/").some((part) => part === "..")) {
    throw new Error("Unsafe organization backup object key");
  }
  return `objects/${key}`;
}

function buildBackupFilename(slug: string, createdAt: Date) {
  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "organization";
  const timestamp = createdAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:]/g, "");
  return `${safeSlug}-backup-${timestamp}.zip`;
}

function serializeJson(value: unknown) {
  return Buffer.from(`${serializeJsonValue(value)}\n`);
}

function serializeJsonValue(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  );
}

function shouldStoreWithoutCompression(contentType: string) {
  return (
    contentType.startsWith("image/") ||
    contentType === "application/pdf" ||
    contentType.includes("officedocument") ||
    contentType === "application/zip"
  );
}
