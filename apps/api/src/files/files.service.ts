import { randomUUID } from "node:crypto";
import { lockOrganizationCapacity } from "../entitlements/seats/organization-capacity";
import {
  fileObjectsDb,
  storedFilesDb,
  uploadSessionsDb,
} from "./file-storage.entity";
import { inArray, ne, or } from "drizzle-orm";
import { storageError } from "./storage-policy";
import { DatabaseService } from "@app/db";
import { StorageService } from "@app/storage";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { workspacesDb } from "../workspaces/core/workspaces.entity";
import { OrganizationMismatchError } from "../sync/sync.errors";
import { workspaceAccessCondition } from "../workspaces/core/workspace-access";

const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const SAFE_FILE_EXTENSION_REGEX = /^[a-zA-Z0-9]{1,32}$/;

@Injectable()
export class FilesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService
  ) {}

  async getDownloadUrl(params: {
    fileExtension?: string;
    fileId: string;
    filename?: string;
    organizationId: string;
    workspaceId: string;
    userId?: string;
  }) {
    await this.assertWorkspaceOwnership(
      params.workspaceId,
      params.organizationId,
      params.userId,
      "read"
    );
    const key = await this.resolveObjectKey(params);
    return { downloadUrl: await this.storage.getSignedDownloadUrl(key, 600) };
  }

  async deleteFile(params: {
    fileExtension?: string;
    fileId: string;
    filename?: string;
    organizationId: string;
    workspaceId: string;
    userId?: string;
  }) {
    await this.assertWorkspaceOwnership(
      params.workspaceId,
      params.organizationId,
      params.userId,
      "write"
    );
    await this.db.db.transaction(async (tx) => {
      await lockOrganizationCapacity(tx, params.organizationId);
      const [active] = await tx
        .select({ id: uploadSessionsDb.id })
        .from(uploadSessionsDb)
        .where(
          and(
            eq(uploadSessionsDb.organizationId, params.organizationId),
            eq(uploadSessionsDb.workspaceId, params.workspaceId),
            inArray(uploadSessionsDb.state, [
              "creating",
              "uploading",
              "completing",
              "canceling",
            ]),
            or(
              eq(uploadSessionsDb.fileId, params.fileId),
              eq(uploadSessionsDb.replacementFileId, params.fileId)
            )
          )
        );
      if (active) {
        storageError(
          "UPLOAD_IN_PROGRESS",
          "Cancel the active upload before deleting this file"
        );
      }
      const [file] = await tx
        .select()
        .from(storedFilesDb)
        .where(
          and(
            eq(storedFilesDb.organizationId, params.organizationId),
            eq(storedFilesDb.workspaceId, params.workspaceId),
            eq(storedFilesDb.fileId, params.fileId)
          )
        );
      const key =
        file?.objectKey ??
        this.buildKey({ ...params, extension: this.resolveExtension(params) });
      if (!file) {
        const size = await this.storage.objectSize(key);
        if (size === null) {
          return;
        }
        await tx
          .insert(fileObjectsDb)
          .values({
            key,
            organizationId: params.organizationId,
            workspaceId: params.workspaceId,
            sizeBytes: size,
            state: "pending_delete",
          })
          .onConflictDoNothing();
        await tx
          .insert(storedFilesDb)
          .values({
            id: randomUUID(),
            organizationId: params.organizationId,
            workspaceId: params.workspaceId,
            fileId: params.fileId,
            objectKey: key,
          })
          .onConflictDoNothing();
      }
      const references = await tx
        .select({ id: storedFilesDb.id })
        .from(storedFilesDb)
        .where(eq(storedFilesDb.objectKey, key));
      if (references.length > 1) {
        await tx
          .delete(storedFilesDb)
          .where(
            and(
              eq(storedFilesDb.organizationId, params.organizationId),
              eq(storedFilesDb.workspaceId, params.workspaceId),
              eq(storedFilesDb.fileId, params.fileId)
            )
          );
        return;
      }
      await tx
        .update(fileObjectsDb)
        .set({ state: "pending_delete" })
        .where(
          and(eq(fileObjectsDb.key, key), ne(fileObjectsDb.state, "deleted"))
        );
    });

    return { id: params.fileId };
  }

  async resolveObjectKey(params: {
    organizationId: string;
    workspaceId: string;
    fileId: string;
    fileExtension?: string;
    filename?: string;
  }) {
    const [file] = await this.db.db
      .select({ key: storedFilesDb.objectKey, state: fileObjectsDb.state })
      .from(storedFilesDb)
      .innerJoin(fileObjectsDb, eq(storedFilesDb.objectKey, fileObjectsDb.key))
      .where(
        and(
          eq(storedFilesDb.organizationId, params.organizationId),
          eq(storedFilesDb.workspaceId, params.workspaceId),
          eq(storedFilesDb.fileId, params.fileId)
        )
      );
    if (file?.state === "deleted") {
      throw new NotFoundException("File not found");
    }
    return (
      file?.key ??
      this.buildKey({ ...params, extension: this.resolveExtension(params) })
    );
  }

  private async assertWorkspaceOwnership(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    access: "read" | "write" = "read"
  ) {
    const rows = await this.db.db
      .select({ id: workspacesDb.id })
      .from(workspacesDb)
      .where(
        and(
          eq(workspacesDb.id, workspaceId),
          workspaceAccessCondition(organizationId, userId, access)
        )
      );
    if (rows.length === 0) {
      throw new OrganizationMismatchError(
        "Workspace",
        workspaceId,
        organizationId
      );
    }
  }

  private buildKey(params: {
    extension: string;
    fileId: string;
    organizationId: string;
    workspaceId: string;
  }) {
    if (!SAFE_FILENAME_REGEX.test(params.fileId)) {
      throw new BadRequestException("Invalid file id");
    }
    if (!SAFE_FILE_EXTENSION_REGEX.test(params.extension)) {
      throw new BadRequestException("Invalid file extension");
    }
    return `files/${params.organizationId}/${params.workspaceId}/${params.fileId}.${params.extension}`;
  }

  private resolveExtension(params: {
    fileExtension?: string;
    filename?: string;
  }) {
    if (params.fileExtension) {
      return this.validateExtension(params.fileExtension.toLowerCase());
    }
    if (!params.filename) {
      throw new BadRequestException("Unsupported file extension");
    }
    return this.extensionFromFilename(params.filename);
  }

  private extensionFromFilename(filename: string) {
    const extension = filename.split(".").pop()?.toLowerCase();
    if (!extension) {
      throw new BadRequestException("Unsupported file extension");
    }
    return this.validateExtension(extension);
  }

  private validateExtension(extension: string) {
    if (!SAFE_FILE_EXTENSION_REGEX.test(extension)) {
      throw new BadRequestException("Invalid file extension");
    }
    return extension;
  }
}
