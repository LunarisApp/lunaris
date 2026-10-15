import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import type { DatabaseService } from "@app/db";
import { StorageService } from "@app/storage";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createPlans } from "@repo/auth/billing";
import { user, organization, member } from "../auth/auth.entity";
import { BillingService } from "../entitlements/billing/billing.service";
import { subscription } from "../entitlements/billing/subscription.entity";
import { workspacesDb } from "../workspaces/core/workspaces.entity";
import {
  fileObjectsDb,
  organizationStorageDb,
  storedFilesDb,
  uploadSessionsDb,
} from "./file-storage.entity";
import { UploadSessionsService } from "./upload-sessions.service";
import { StorageReconciliationService } from "./storage-reconciliation.service";
import { WorkspaceResourcesService } from "../workspaces/resources/workspace-resources.service";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "../workspaces/resources/workspace-resources.entity";
import { workspaceStorageSlotsDb } from "../workspaces/storage/workspace-storage.entity";
import { workspaceStorageSlotsHandler } from "../sync/handlers/workspace-storage-slots.handler";
import { FilesService } from "./files.service";
import { readStorageAccounting } from "./storage-accounting";
import { UPLOAD_PART_BYTES } from "./storage-policy";

const integration =
  process.env.RUN_STORAGE_INTEGRATION === "1" ? describe : describe.skip;
integration("organization storage (real PostgreSQL and Garage)", () => {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const databaseName = `lunaris_storage_test_${suffix}`;
  const organizationId = `storage-test-${suffix}`;
  const actor = { organizationId, userId: "owner" };
  let admin: Pool;
  let pool: Pool;
  let database: DatabaseService;
  let storage: StorageService;
  let uploads: UploadSessionsService;
  let reconciliation: StorageReconciliationService;
  let files: FilesService;
  const config = { developmentPlan: null };
  const input = (sizeBytes = 3, fileId: string = crypto.randomUUID()) => ({
    id: crypto.randomUUID(),
    fileId,
    workspaceId: "workspace",
    sizeBytes,
    mediaType: "application/octet-stream",
  });

  beforeAll(async () => {
    const credentials = {
      host: process.env.DATABASE_HOST ?? "localhost",
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
    };
    admin = new Pool({ ...credentials, database: "postgres" });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ ...credentials, database: databaseName, max: 25 });
    const db = drizzle({ client: pool, casing: "snake_case" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    database = { db, pool };
    storage = new StorageService({
      endpoint: process.env.AWS_ENDPOINT_URL!,
      publicEndpoint: process.env.AWS_PUBLIC_ENDPOINT_URL ?? process.env.AWS_ENDPOINT_URL!,
      region: process.env.AWS_DEFAULT_REGION!,
      bucket: process.env.AWS_S3_BUCKET!,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    });
    await storage.verifyBucket();
    const billing = new BillingService(
      database,
      createPlans({
        plusMonthly: "plus",
        plusYearly: "plus-yearly",
        businessMonthly: "business",
        businessYearly: "business-yearly",
      }),
      null,
      {} as never,
    );
    uploads = new UploadSessionsService(
      database,
      storage,
      billing,
      config as never,
    );
    reconciliation = new StorageReconciliationService(
      database,
      storage,
      uploads,
    );
    files = new FilesService(database, storage);
    await db.insert(user).values(
      ["owner", "other"].map((id) => ({
        id,
        name: id,
        email: `${id}@storage.test`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    await db.insert(organization).values({
      id: organizationId,
      name: "Storage integration",
      slug: organizationId,
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: "owner-member",
      organizationId,
      userId: "owner",
      role: "owner",
      createdAt: new Date(),
    });
    await db.insert(workspacesDb).values({
      id: "workspace",
      organizationId,
      name: "Files",
      slug: "files",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(organizationStorageDb).values({
      organizationId,
      inventoryCompletedAt: new Date(),
      enforcementEnabled: true,
    });
  }, 60_000);

  beforeEach(async () => {
    for (const session of await database.db.select().from(uploadSessionsDb))
      await storage.abortMultipartForKey(session.objectKey);
    for await (const object of storage.listObjects(`files/${organizationId}/`))
      await storage.deleteObject(object.key);
    await database.db.delete(workspaceResourcesDb);
    await database.db.delete(uploadSessionsDb);
    await database.db.delete(storedFilesDb);
    await database.db.delete(fileObjectsDb);
    await database.db.delete(subscription);
    await database.db.delete(member).where(eq(member.id, "other-member"));
    await database.db
      .update(workspacesDb)
      .set({ visibility: "shared", ownerId: null })
      .where(eq(workspacesDb.id, "workspace"));
  });

  afterAll(async () => {
    if (storage && database) {
      for (const session of await database.db.select().from(uploadSessionsDb))
        await storage.abortMultipartForKey(session.objectKey);
      for await (const object of storage.listObjects(
        `files/${organizationId}/`,
      ))
        await storage.deleteObject(object.key);
      await storage.onModuleDestroy();
    }
    await pool?.end();
    if (admin) {
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await admin.end();
    }
  });

  const putPart = async (
    id: string,
    partNumber: number,
    bytes: Uint8Array<ArrayBuffer>,
  ) => {
    const signed = await uploads.signPart(actor, id, partNumber);
    const response = await fetch(signed.url, { method: "PUT", body: bytes });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Garage part failed: ${response.status} ${body.match(/<Code>(.*?)<\/Code>/)?.[1]} ${body.match(/<Message>(.*?)<\/Message>/)?.[1]}`,
      );
    }
    return response;
  };
  const storeFile = async (size = 3, fileId: string = crypto.randomUUID()) => {
    const request = input(size, fileId);
    await uploads.create(actor, request);
    expect((await putPart(request.id, 1, new Uint8Array(size))).ok).toBe(true);
    await uploads.complete(actor, request.id);
    return request;
  };

  it("serializes final capacity across devices and duplicate reservations", async () => {
    await database.db.insert(fileObjectsDb).values({
      key: "accounted",
      organizationId,
      sizeBytes: 249_999_990,
      state: "orphan",
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => uploads.create(actor, input(10))),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(10);
    const [session] = await database.db.select().from(uploadSessionsDb);
    const same = { ...input(10, session!.fileId), id: session!.id };
    await Promise.all(
      Array.from({ length: 4 }, () => uploads.create(actor, same)),
    );
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(10);
  }, 30_000);

  it("verifies lengths, missing parts, idempotent completion and prevents upload replay", async () => {
    const request = input(UPLOAD_PART_BYTES + 3);
    await uploads.create(actor, request);
    const signed = await uploads.signPart(actor, request.id, 1);
    const wrong = await fetch(signed.url, {
      method: "PUT",
      body: new Uint8Array(1),
    });
    expect(wrong.ok).toBe(false);
    await expect(uploads.complete(actor, request.id)).rejects.toThrow();
    // A failed part verification remains recoverable; no new URLs are issued once completing.
    await uploads.cancel(actor, request.id);
    const valid = await storeFile();
    await uploads.complete(actor, valid.id);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    await expect(uploads.signPart(actor, valid.id, 1)).rejects.toThrow();
    const [record] = await database.db
      .select()
      .from(uploadSessionsDb)
      .where(eq(uploadSessionsDb.id, valid.id));
    await storage.deleteObject(record!.objectKey);
    await expect(
      storage.completeMultipart(record!.objectKey, record!.uploadId!, [
        { PartNumber: 1, ETag: "replay" },
      ]),
    ).rejects.toThrow();
  }, 30_000);

  it("keeps reservations during cleanup failures and aborts expired multipart uploads", async () => {
    const request = input(3);
    await uploads.create(actor, request);
    const signed = await uploads.signPart(actor, request.id, 1);
    await database.db
      .update(uploadSessionsDb)
      .set({ expiresAt: new Date(0) })
      .where(eq(uploadSessionsDb.id, request.id));
    await expect(uploads.resume(actor, request.id)).rejects.toThrow();
    const original = storage.abortMultipartForKey.bind(storage);
    storage.abortMultipartForKey = mock(async () => {
      throw new Error("provider unavailable");
    });
    await expect(uploads.cancel(actor, request.id)).rejects.toThrow();
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(3);
    storage.abortMultipartForKey = original;
    await reconciliation.reconcile();
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(0);
    expect(
      (await fetch(signed.url, { method: "PUT", body: new Uint8Array(3) })).ok,
    ).toBe(false);
  });

  it("recovers an interrupted provider completion, and releases usage only after successful deletion", async () => {
    const request = input();
    await uploads.create(actor, request);
    await putPart(request.id, 1, new Uint8Array(3));
    const [session] = await database.db
      .select()
      .from(uploadSessionsDb)
      .where(eq(uploadSessionsDb.id, request.id));
    await database.db
      .update(uploadSessionsDb)
      .set({ state: "completing" })
      .where(eq(uploadSessionsDb.id, request.id));
    await storage.completeMultipart(
      session!.objectKey,
      session!.uploadId!,
      await storage.listParts(session!.objectKey, session!.uploadId!),
    );
    await reconciliation.reconcile();
    await files.deleteFile({
      ...actor,
      workspaceId: "workspace",
      fileId: request.fileId,
      filename: "file.bin",
    });
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    const original = storage.deleteObject.bind(storage);
    storage.deleteObject = mock(async () => {
      throw new Error("delete unavailable");
    });
    await reconciliation.reconcile();
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    storage.deleteObject = original;
    await reconciliation.reconcile();
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(0);
    await files.deleteFile({
      ...actor,
      workspaceId: "workspace",
      fileId: request.fileId,
      filename: "file.bin",
    });
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(0);
    await expect(
      files.getDownloadUrl({
        ...actor,
        workspaceId: "workspace",
        fileId: request.fileId,
        filename: "file.bin",
      }),
    ).rejects.toThrow();
  });

  it("allows smaller replacements over quota, serializes replacement targets, and counts overlap", async () => {
    const previous = await storeFile(5);
    await database.db.insert(fileObjectsDb).values({
      key: "over-quota",
      organizationId,
      sizeBytes: 250_000_000,
      state: "orphan",
    });
    const request = { ...input(3), replacementFileId: previous.fileId };
    await uploads.create(actor, request);
    await expect(
      uploads.create(actor, {
        ...input(2),
        replacementFileId: previous.fileId,
      }),
    ).rejects.toThrow();
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(0);
    await putPart(request.id, 1, new Uint8Array(3));
    await uploads.complete(actor, request.id);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(250_000_008);
    await expect(uploads.create(actor, input(1))).rejects.toThrow();
    await reconciliation.reconcile();
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(250_000_003);
  });

  it("does not report completion when cancellation wins after durable intent", async () => {
    const request = input(3);
    await uploads.create(actor, request);
    await putPart(request.id, 1, new Uint8Array(3));
    const finish = uploads.finish.bind(uploads);
    uploads.finish = async (id, currentActor) => {
      await uploads.cancel(actor, id);
      return finish(id, currentActor);
    };
    try {
      await expect(uploads.complete(actor, request.id)).rejects.toThrow(
        "Upload was canceled",
      );
    } finally {
      uploads.finish = finish;
    }
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(0);
    expect(await database.db.select().from(storedFilesDb)).toHaveLength(0);
    expect((await uploads.cancel(actor, request.id)).state).toBe("canceled");
  });

  it("charges replacement overlap when provider completion succeeds but its response is lost", async () => {
    const previous = await storeFile(5);
    await database.db.insert(fileObjectsDb).values({
      key: "nearly-full",
      organizationId,
      sizeBytes: 249_999_991,
      state: "orphan",
    });
    const request = { ...input(3), replacementFileId: previous.fileId };
    await uploads.create(actor, request);
    await putPart(request.id, 1, new Uint8Array(3));
    const complete = storage.completeMultipart.bind(storage);
    storage.completeMultipart = async (...args) => {
      await complete(...args);
      throw new Error("Provider response lost");
    };
    try {
      await expect(uploads.complete(actor, request.id)).rejects.toThrow(
        "Provider response lost",
      );
    } finally {
      storage.completeMultipart = complete;
    }
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(3);
    await expect(uploads.create(actor, input(2))).rejects.toThrow();
    await reconciliation.reconcile();
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(0);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(249_999_994);
  });

  it("shared objects receive no replacement credit and inventory is idempotent", async () => {
    const previous = await storeFile(5);
    const [stored] = await database.db.select().from(storedFilesDb);
    await database.db
      .insert(storedFilesDb)
      .values({ ...stored!, id: "shared", fileId: "shared" });
    const request = { ...input(3), replacementFileId: previous.fileId };
    await uploads.create(actor, request);
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(3);
    await storage.putObject(
      `files/${organizationId}/workspace/orphan.bin`,
      new Uint8Array(7),
    );
    await reconciliation.inventoryOrganization(organizationId);
    await reconciliation.inventoryOrganization(organizationId);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(12);
    await storage.deleteObject(stored!.objectKey);
    await reconciliation.inventoryOrganization(organizationId);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(12);
  });

  it("rechecks workspace access on every operation and keeps over-quota downloads available", async () => {
    const previous = await storeFile();
    const request = input();
    await uploads.create(actor, request);
    await database.db
      .update(workspacesDb)
      .set({ visibility: "private", ownerId: "other" })
      .where(eq(workspacesDb.id, "workspace"));
    await expect(uploads.resume(actor, request.id)).rejects.toThrow();
    await expect(uploads.signPart(actor, request.id, 1)).rejects.toThrow();
    await expect(uploads.complete(actor, request.id)).rejects.toThrow();
    await expect(uploads.cancel(actor, request.id)).rejects.toThrow();
    await database.db
      .update(workspacesDb)
      .set({ ownerId: "owner" })
      .where(eq(workspacesDb.id, "workspace"));
    await database.db.insert(fileObjectsDb).values({
      key: "over-quota",
      organizationId,
      sizeBytes: 250_000_000,
      state: "orphan",
    });
    const url = await files.getDownloadUrl({
      ...actor,
      workspaceId: "workspace",
      fileId: previous.fileId,
      filename: "file.bin",
    });
    expect((await fetch(url.downloadUrl)).ok).toBe(true);
  });

  it("keeps upload capacity fixed when members join or leave", async () => {
    await database.db.insert(subscription).values({
      polarSubscriptionId: "sub",
      organizationId,
      purchasedByUserId: "owner",
      productId: "plus",
      planSlug: "plus",
      status: "active",
    });
    await database.db.insert(member).values({
      id: "other-member",
      organizationId,
      userId: "other",
      role: "member",
      createdAt: new Date(),
    });
    await database.db.insert(fileObjectsDb).values({
      key: "organization-pool",
      organizationId,
      sizeBytes: 9_999_999_997,
      state: "orphan",
    });
    const request = input();
    await uploads.create(actor, request);
    await putPart(request.id, 1, new Uint8Array(3));
    await database.db.delete(member).where(eq(member.id, "other-member"));
    await uploads.complete(actor, request.id);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(10_000_000_000);
    await database.db.insert(member).values({
      id: "other-member",
      organizationId,
      userId: "other",
      role: "member",
      createdAt: new Date(),
    });
    await expect(uploads.create(actor, input(1))).rejects.toMatchObject({
      response: { code: "STORAGE_QUOTA_EXCEEDED" },
    });
  });

  it("rechecks a plan downgrade before completing a reserved upload", async () => {
    await database.db.insert(subscription).values({
      polarSubscriptionId: "sub",
      organizationId,
      purchasedByUserId: "owner",
      productId: "plus",
      planSlug: "plus",
      status: "active",
    });
    await database.db.insert(fileObjectsDb).values({
      key: "organization-pool",
      organizationId,
      sizeBytes: 250_000_000,
      state: "orphan",
    });
    const request = input();
    await uploads.create(actor, request);
    await putPart(request.id, 1, new Uint8Array(3));
    await database.db.delete(subscription);
    await expect(uploads.complete(actor, request.id)).rejects.toMatchObject({
      response: { code: "STORAGE_QUOTA_EXCEEDED" },
    });
    expect(
      (await readStorageAccounting(database.db, organizationId)).reservedBytes,
    ).toBe(3);
  });

  it("retains trash bytes and preserves shared objects until the final resource is purged", async () => {
    const uploaded = await storeFile(3, "original");
    const [object] = await database.db.select().from(fileObjectsDb);
    await database.db.insert(storedFilesDb).values({
      id: "alias",
      organizationId,
      workspaceId: "workspace",
      fileId: "alias",
      objectKey: object!.key,
    });
    const now = new Date();
    for (const fileId of [uploaded.fileId, "alias"]) {
      await database.db.insert(workspaceResourcesDb).values({
        id: fileId,
        workspaceId: "workspace",
        name: fileId,
        resourceTypeId: "file",
        createdAt: now,
        updatedAt: now,
      });
      await database.db.insert(workspaceStorageSlotsDb).values({
        id: `slot-${fileId}`,
        workspaceId: "workspace",
        resourceId: fileId,
        name: "content",
        kind: "file",
        backingId: fileId,
        createdAt: now,
        updatedAt: now,
        metadata: JSON.stringify({
          fileId,
          attachmentId: fileId,
          fileExtension: "bin",
          filename: "file.bin",
          mediaType: "application/octet-stream",
          size: 3,
        }),
      });
      await database.db.insert(workspaceResourceTrashDb).values({
        id: fileId,
        workspaceId: "workspace",
        trashRootId: fileId,
        trashedAt: now,
        purgeAt: new Date(now.getTime() + 30 * 86400_000),
      });
    }
    await reconciliation.inventoryOrganization(organizationId);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    const resources = new WorkspaceResourcesService(
      database,
      {} as never,
      files,
    );
    await database.db.transaction((tx) =>
      resources.purgeWithDb(
        tx,
        uploaded.fileId,
        "workspace",
        organizationId,
        "owner",
      ),
    );
    await reconciliation.reconcile();
    expect(await storage.objectSize(object!.key)).toBe(3);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    await database.db.transaction((tx) =>
      resources.purgeWithDb(tx, "alias", "workspace", organizationId, "owner"),
    );
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    await reconciliation.reconcile();
    expect(await storage.objectSize(object!.key)).toBeNull();
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(0);
  });

  it("preserves physical bytes shared with a surviving workspace", async () => {
    const now = new Date();
    await database.db.insert(workspacesDb).values({
      id: "source-workspace",
      organizationId,
      name: "Source",
      slug: "source",
      createdAt: now,
      updatedAt: now,
    });
    const request = { ...input(3), workspaceId: "source-workspace" };
    await uploads.create(actor, request);
    await putPart(request.id, 1, new Uint8Array(3));
    await uploads.complete(actor, request.id);
    const [object] = await database.db.select().from(fileObjectsDb);
    await database.db.insert(storedFilesDb).values({
      id: "surviving-alias",
      organizationId,
      workspaceId: "workspace",
      fileId: "shared",
      objectKey: object!.key,
    });
    await database.db
      .delete(workspacesDb)
      .where(eq(workspacesDb.id, "source-workspace"));
    await reconciliation.reconcile();
    expect(await storage.objectSize(object!.key)).toBe(3);
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(3);
    await files.deleteFile({
      ...actor,
      workspaceId: "workspace",
      fileId: "shared",
      filename: "file.bin",
    });
    await reconciliation.reconcile();
    expect(await storage.objectSize(object!.key)).toBeNull();
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(0);
  });

  it("scopes retired-file reference checks to the target workspace", async () => {
    const now = new Date();
    await database.db.insert(fileObjectsDb).values({
      key: "retired",
      organizationId,
      workspaceId: "private-workspace",
      sizeBytes: 3,
      state: "deleted",
    });
    await database.db.insert(storedFilesDb).values({
      id: "retired",
      organizationId,
      workspaceId: "private-workspace",
      fileId: "same-id",
      objectKey: "retired",
    });
    await database.db.insert(workspaceResourcesDb).values({
      id: "resource",
      workspaceId: "workspace",
      name: "File",
      resourceTypeId: "file",
      createdAt: now,
      updatedAt: now,
    });
    const authorize = () =>
      database.db.transaction((tx) =>
        workspaceStorageSlotsHandler.authorize(
          tx,
          "PUT",
          "slot",
          {
            workspaceId: "workspace",
            resourceId: "resource",
            name: "content",
            kind: "file",
            backingId: "same-id",
          },
          organizationId,
          "owner",
        ),
      );
    await expect(authorize()).resolves.toBeUndefined();
    await database.db
      .update(storedFilesDb)
      .set({ workspaceId: "workspace" })
      .where(eq(storedFilesDb.id, "retired"));
    await expect(authorize()).rejects.toThrow(
      "File is being replaced or deleted",
    );
  });

  it("advances cleanup beyond a full page of provider failures", async () => {
    await database.db.insert(fileObjectsDb).values(
      Array.from({ length: 501 }, (_, index) => ({
        key: `cleanup-${String(index).padStart(3, "0")}`,
        organizationId,
        sizeBytes: 1,
        state: "pending_delete" as const,
      })),
    );
    const original = storage.deleteObject.bind(storage);
    storage.deleteObject = async (key) => {
      if (key !== "cleanup-500") throw new Error("Provider unavailable");
    };
    try {
      await reconciliation.reconcile();
    } finally {
      storage.deleteObject = original;
    }
    expect(
      (
        await database.db
          .select()
          .from(fileObjectsDb)
          .where(eq(fileObjectsDb.key, "cleanup-500"))
      )[0]!.state,
    ).toBe("deleted");
    expect(
      (await readStorageAccounting(database.db, organizationId)).committedBytes,
    ).toBe(500);
  }, 30_000);

  (process.env.RUN_LARGE_STORAGE_TEST === "1" ? it : it.skip)(
    "uploads 5 GB with bounded buffers and restart/resume",
    async () => {
      await database.db.insert(subscription).values({
        polarSubscriptionId: "sub",
        organizationId,
        purchasedByUserId: "owner",
        productId: "business",
        planSlug: "business",
        status: "active",
      });
      const request = input(5_000_000_000);
      await uploads.create(actor, request);
      const buffer = new Uint8Array(UPLOAD_PART_BYTES);
      const initialRss = process.memoryUsage().rss;
      let peakRss = initialRss;
      for (let number = 1; number <= 299; number++) {
        if (number === 10) {
          const interrupted = await uploads.signPart(actor, request.id, number);
          const abort = new AbortController();
          const timer = setTimeout(() => abort.abort(), 1);
          await fetch(interrupted.url, {
            method: "PUT",
            body: buffer,
            signal: abort.signal,
          }).catch(() => undefined);
          clearTimeout(timer);
          const resumed = await uploads.resume(actor, request.id);
          expect(resumed.uploadedParts.length).toBeGreaterThanOrEqual(9);
        }
        const size = Math.min(
          UPLOAD_PART_BYTES,
          request.sizeBytes - (number - 1) * UPLOAD_PART_BYTES,
        );
        expect(
          (await putPart(request.id, number, buffer.subarray(0, size))).ok,
        ).toBe(true);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }
      expect(peakRss - initialRss).toBeLessThan(512_000_000);
      process.stdout.write(
        `5 GB upload peak RSS increase: ${peakRss - initialRss} bytes\n`,
      );
      await uploads.complete(actor, request.id);
      expect(
        (await readStorageAccounting(database.db, organizationId))
          .committedBytes,
      ).toBe(5_000_000_000);
      const [session] = await database.db
        .select()
        .from(uploadSessionsDb)
        .where(eq(uploadSessionsDb.id, request.id));
      expect(await storage.objectSize(session!.objectKey)).toBe(5_000_000_000);
    },
    600_000,
  );
});
