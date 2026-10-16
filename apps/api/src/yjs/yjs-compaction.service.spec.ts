import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { DatabaseService } from "@app/db";
import { Test, TestingModule } from "@nestjs/testing";
import { applyUpdateV2, Doc, encodeStateAsUpdateV2 } from "yjs";
import { YjsCompactionService } from "./yjs-compaction.service";

function buildUpdate(title: string) {
  const doc = new Doc();
  doc.getMap("meta").set("title", title);
  const update = Buffer.from(encodeStateAsUpdateV2(doc));
  doc.destroy();
  return update;
}

function createRow(
  index: number,
  updateData = buildUpdate(`Title ${index}`),
  createdAt = new Date(Date.UTC(2026, 0, 1, 0, index, 0)),
  userId: string | null = `user_${index}`
) {
  return {
    id: `update_${index}`,
    workspaceId: "workspace_1",
    documentId: "doc_1",
    userId,
    updateData,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("YjsCompactionService", () => {
  let service: YjsCompactionService;
  let databaseService: {
    db: {
      execute: ReturnType<typeof mock>;
      transaction: ReturnType<typeof mock>;
      select: ReturnType<typeof mock>;
    };
  };

  beforeEach(async () => {
    databaseService = {
      db: {
        execute: mock(),
        transaction: mock(),
        select: mock(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YjsCompactionService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    service = module.get(YjsCompactionService);
  });

  it("skips the cron run when the advisory lock is not acquired", async () => {
    databaseService.db.execute.mockResolvedValueOnce({
      rows: [{ acquired: false }],
    });
    const compactSpy = spyOn(service, "compactBucket");

    await service.compactEligibleBuckets();

    expect(compactSpy).not.toHaveBeenCalled();
  });

  it("compacts buckets returned by the eligibility query", async () => {
    databaseService.db.execute
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const bucketA = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const bucketB = new Date(Date.UTC(2026, 0, 2, 0, 0, 0));
    spyOn(service, "findEligibleBuckets").mockResolvedValue([
      { documentId: "doc_1", bucketStart: bucketA },
      { documentId: "doc_2", bucketStart: bucketB },
    ]);
    const compactSpy = spyOn(service, "compactBucket").mockResolvedValue(true);

    await service.compactEligibleBuckets();

    expect(compactSpy).toHaveBeenCalledTimes(2);
    expect(compactSpy).toHaveBeenCalledWith("doc_1", bucketA);
    expect(compactSpy).toHaveBeenCalledWith("doc_2", bucketB);
  });

  it("continues to the next bucket when one compaction fails", async () => {
    databaseService.db.execute
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [] });
    spyOn(service, "findEligibleBuckets").mockResolvedValue([
      { documentId: "doc_bad", bucketStart: new Date(Date.UTC(2026, 0, 1)) },
      { documentId: "doc_ok", bucketStart: new Date(Date.UTC(2026, 0, 2)) },
    ]);
    const compactSpy = spyOn(service, "compactBucket")
      .mockRejectedValueOnce(new Error("bad update"))
      .mockResolvedValueOnce(true);

    await service.compactEligibleBuckets();

    expect(compactSpy).toHaveBeenCalledTimes(2);
  });

  it("maps SQL bucket rows into compactable day buckets", async () => {
    const bucketA = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const bucketB = new Date(Date.UTC(2026, 0, 2, 0, 0, 0));
    databaseService.db.execute.mockResolvedValueOnce({
      rows: [
        { document_id: "doc_1", bucket_start: bucketA },
        { document_id: "doc_2", bucket_start: bucketB.toISOString() },
      ],
    });

    const buckets = await service.findEligibleBuckets();

    expect(buckets).toEqual([
      { documentId: "doc_1", bucketStart: bucketA },
      { documentId: "doc_2", bucketStart: bucketB },
    ]);
  });

  it("returns no buckets when no old day has more than one row", async () => {
    databaseService.db.execute.mockResolvedValueOnce({ rows: [] });

    const buckets = await service.findEligibleBuckets();

    expect(buckets).toEqual([]);
  });

  it("uses retention-day bucketing instead of the old count threshold", async () => {
    const execute = databaseService.db.execute;
    execute.mockResolvedValueOnce({ rows: [] });

    await service.findEligibleBuckets();

    const statement = (execute.mock.calls[0]?.[0]?.queryChunks ?? [])
      .map((chunk: number | { value?: string[] }) =>
        typeof chunk === "number"
          ? String(chunk)
          : (chunk.value?.join("") ?? "")
      )
      .join(" ");
    expect(statement).toContain("yjs_retention_days");
    expect(statement).toContain("date_trunc");
    expect(statement).toContain("max(u.created_at)");
    expect(statement).toContain("max(COALESCE(o.yjs_retention_days");
    expect(statement).not.toContain("100");
    expect(statement).not.toContain("WHERE u.created_at < NOW()");
  });

  it("does not compact fresh high-volume documents when the retention query finds no old buckets", async () => {
    databaseService.db.execute
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [] });
    spyOn(service, "findEligibleBuckets").mockResolvedValue([]);
    const compactSpy = spyOn(service, "compactBucket");

    await service.compactEligibleBuckets();

    expect(compactSpy).not.toHaveBeenCalled();
  });

  describe("compactBucket", () => {
    function createMockTx(
      rows: ReturnType<typeof createRow>[],
      insertValues?: ReturnType<typeof mock>
    ) {
      return {
        select: mock().mockReturnValue({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                for: async () => rows,
              }),
            }),
          }),
        }),
        delete: mock().mockReturnValue({
          where: mock().mockResolvedValue(undefined),
        }),
        insert: mock().mockReturnValue({
          values: insertValues ?? mock().mockResolvedValue(undefined),
        }),
      };
    }

    it("skips a day bucket with a single old update", async () => {
      const rows = [
        createRow(1, undefined, new Date(Date.UTC(2025, 11, 20, 12, 0, 0))),
      ];
      const tx = createMockTx(rows);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactBucket(
        "doc_1",
        new Date(Date.UTC(2025, 11, 20, 0, 0, 0))
      );

      expect(result).toBe(false);
      expect(tx.delete).not.toHaveBeenCalled();
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("compacts all updates inside an eligible old day bucket", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_A"
        ),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(rows, insertValues);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactBucket("doc_1", bucketStart);

      expect(result).toBe(true);
      expect(tx.delete).toHaveBeenCalledTimes(1);
      expect(tx.insert).toHaveBeenCalledTimes(1);
    });

    it("anchors the merged row to the newest compacted timestamp and preserves the group's user", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 9, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 12, 0, 0)),
          "user_A"
        ),
        createRow(
          3,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(rows, insertValues);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      await service.compactBucket("doc_1", bucketStart);

      const inserted = insertValues.mock.calls[0]?.[0];
      expect(Array.isArray(inserted) ? inserted[0] : inserted).toMatchObject({
        userId: "user_A",
        createdAt: rows[1]?.createdAt,
        updatedAt: rows[1]?.updatedAt,
      });
    });

    it("produces one compacted row per user when the bucket contains multiple authors", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 9, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
        createRow(
          3,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_A"
        ),
        createRow(
          4,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 12, 0, 0)),
          "user_B"
        ),
        createRow(
          5,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 13, 0, 0)),
          "user_B"
        ),
        createRow(
          6,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 14, 0, 0)),
          "user_B"
        ),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(rows, insertValues);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactBucket("doc_1", bucketStart);

      expect(result).toBe(true);
      const inserted = insertValues.mock.calls[0]?.[0] as Array<{
        userId: string | null;
      }>;
      expect(inserted).toHaveLength(2);
      const userIds = inserted.map((r) => r.userId).sort();
      expect(userIds).toEqual(["user_A", "user_B"]);
    });

    it("leaves a lone-author row untouched and merges the majority author's rows", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 9, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
        createRow(
          3,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_A"
        ),
        createRow(
          4,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 12, 0, 0)),
          "user_B"
        ),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(rows, insertValues);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactBucket("doc_1", bucketStart);

      expect(result).toBe(true);
      const deleteWhereCall = (
        tx.delete.mock.results[0]!.value as { where: ReturnType<typeof mock> }
      ).where;
      expect(deleteWhereCall).toHaveBeenCalledTimes(1);
      const inserted = insertValues.mock.calls[0]?.[0] as Array<{
        userId: string | null;
      }>;
      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.userId).toBe("user_A");
    });

    it("returns false when no userId group has at least two rows", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 9, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_B"
        ),
        createRow(
          3,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_C"
        ),
      ];
      const tx = createMockTx(rows);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactBucket("doc_1", bucketStart);

      expect(result).toBe(false);
      expect(tx.delete).not.toHaveBeenCalled();
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("groups null-user rows together under one compacted null-user row", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 9, 0, 0)),
          null
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          null
        ),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(rows, insertValues);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactBucket("doc_1", bucketStart);

      expect(result).toBe(true);
      const inserted = insertValues.mock.calls[0]?.[0] as Array<{
        userId: string | null;
      }>;
      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.userId).toBeNull();
    });

    it("rolls back when insert fails after delete", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_A"
        ),
      ];
      const tx = createMockTx(
        rows,
        mock().mockRejectedValue(new Error("insert failed"))
      );
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      await expect(service.compactBucket("doc_1", bucketStart)).rejects.toThrow(
        "insert failed"
      );
    });

    it("throws on malformed update data", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          Buffer.from("bad"),
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_A"
        ),
      ];
      const tx = createMockTx(rows);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      await expect(
        service.compactBucket("doc_1", bucketStart)
      ).rejects.toThrow();
    });

    it("preserves the same reconstructed Yjs state after day-bucket compaction across multiple users", async () => {
      const bucketStart = new Date(Date.UTC(2025, 11, 20, 0, 0, 0));
      const rows = [
        createRow(
          1,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 9, 0, 0)),
          "user_A"
        ),
        createRow(
          2,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 10, 0, 0)),
          "user_A"
        ),
        createRow(
          3,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 11, 0, 0)),
          "user_B"
        ),
        createRow(
          4,
          undefined,
          new Date(Date.UTC(2025, 11, 20, 12, 0, 0)),
          "user_B"
        ),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(rows, insertValues);
      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      await service.compactBucket("doc_1", bucketStart);

      const mergedRows = insertValues.mock.calls[0]?.[0] as Array<{
        updateData: Buffer;
      }>;
      const docBefore = new Doc();
      const docAfter = new Doc();

      try {
        for (const row of rows) {
          applyUpdateV2(docBefore, new Uint8Array(row.updateData));
        }
        for (const mergedRow of mergedRows) {
          applyUpdateV2(docAfter, new Uint8Array(mergedRow.updateData));
        }

        expect(docAfter.toJSON()).toEqual(docBefore.toJSON());
      } finally {
        docBefore.destroy();
        docAfter.destroy();
      }
    });
  });
});

describe("Context-based compaction", () => {
  let service: YjsCompactionService;
  let databaseService: {
    db: {
      execute: ReturnType<typeof mock>;
      transaction: ReturnType<typeof mock>;
      select: ReturnType<typeof mock>;
    };
  };

  beforeEach(async () => {
    databaseService = {
      db: {
        execute: mock(),
        transaction: mock(),
        select: mock(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YjsCompactionService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    service = module.get(YjsCompactionService);
  });

  describe("findCompactableClusters", () => {
    it("returns clusters from the CTE query", async () => {
      databaseService.db.execute.mockResolvedValueOnce({
        rows: [
          { document_id: "doc_1", ids: ["u1", "u2", "u3"] },
          { document_id: "doc_2", ids: ["u4", "u5", "u6", "u7"] },
        ],
      });

      const clusters = await service.findCompactableClusters();

      expect(clusters).toEqual([
        { documentId: "doc_1", ids: ["u1", "u2", "u3"] },
        { documentId: "doc_2", ids: ["u4", "u5", "u6", "u7"] },
      ]);
    });

    it("returns empty array when no clusters qualify", async () => {
      databaseService.db.execute.mockResolvedValueOnce({ rows: [] });

      const clusters = await service.findCompactableClusters();

      expect(clusters).toEqual([]);
    });
  });

  describe("compactCluster", () => {
    function createMockTx(
      rows: ReturnType<typeof createRow>[],
      insertValues?: ReturnType<typeof mock>
    ) {
      return {
        execute: mock().mockResolvedValue({ rows: [{ acquired: true }] }),
        select: mock().mockReturnValue({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                for: async () => rows,
              }),
            }),
          }),
        }),
        delete: mock().mockReturnValue({
          where: mock().mockResolvedValue(undefined),
        }),
        insert: mock().mockReturnValue({
          values: insertValues ?? mock().mockResolvedValue(undefined),
        }),
      };
    }

    it("merges cluster rows from a single author into one row retaining userId", async () => {
      const clusterRows = Array.from({ length: 4 }, (_, i) =>
        createRow(i + 1, undefined, undefined, "user_A")
      );
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(clusterRows, insertValues);

      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactCluster(
        "doc_1",
        clusterRows.map((r) => r.id)
      );

      expect(result).toBe(true);
      expect(tx.delete).toHaveBeenCalledTimes(1);
      expect(tx.insert).toHaveBeenCalledTimes(1);

      const inserted = insertValues.mock.calls[0]?.[0] as Array<{
        userId: string | null;
        documentId: string;
      }>;
      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.userId).toBe("user_A");
      expect(inserted[0]?.documentId).toBe("doc_1");
    });

    it("produces one compacted row per user for mixed-author clusters", async () => {
      const clusterRows = [
        createRow(1, undefined, undefined, "user_A"),
        createRow(2, undefined, undefined, "user_A"),
        createRow(3, undefined, undefined, "user_B"),
        createRow(4, undefined, undefined, "user_B"),
      ];
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(clusterRows, insertValues);

      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactCluster(
        "doc_1",
        clusterRows.map((r) => r.id)
      );

      expect(result).toBe(true);
      const inserted = insertValues.mock.calls[0]?.[0] as Array<{
        userId: string | null;
      }>;
      expect(inserted).toHaveLength(2);
      expect(inserted.map((r) => r.userId).sort()).toEqual([
        "user_A",
        "user_B",
      ]);
    });

    it("skips when advisory lock is not acquired", async () => {
      const tx = createMockTx([]);
      tx.execute.mockResolvedValue({ rows: [{ acquired: false }] });

      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactCluster("doc_1", ["u1", "u2", "u3"]);

      expect(result).toBe(false);
      expect(tx.select).not.toHaveBeenCalled();
    });

    it("skips when fetched rows fall below minimum cluster size", async () => {
      const clusterRows = [createRow(1), createRow(2)];
      const tx = createMockTx(clusterRows);

      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      const result = await service.compactCluster("doc_1", ["u1", "u2"]);

      expect(result).toBe(false);
      expect(tx.delete).not.toHaveBeenCalled();
    });

    it("preserves Yjs state after context compaction", async () => {
      const clusterRows = Array.from({ length: 5 }, (_, i) =>
        createRow(i + 1, undefined, undefined, i < 3 ? "user_A" : "user_B")
      );
      const insertValues = mock().mockResolvedValue(undefined);
      const tx = createMockTx(clusterRows, insertValues);

      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      await service.compactCluster(
        "doc_1",
        clusterRows.map((r) => r.id)
      );

      const mergedRows = insertValues.mock.calls[0]?.[0] as Array<{
        updateData: Buffer;
      }>;
      const docBefore = new Doc();
      const docAfter = new Doc();

      try {
        for (const row of clusterRows) {
          applyUpdateV2(docBefore, new Uint8Array(row.updateData));
        }
        for (const mergedRow of mergedRows) {
          applyUpdateV2(docAfter, new Uint8Array(mergedRow.updateData));
        }

        expect(docAfter.toJSON()).toEqual(docBefore.toJSON());
      } finally {
        docBefore.destroy();
        docAfter.destroy();
      }
    });

    it("rolls back on transaction failure", async () => {
      const clusterRows = Array.from({ length: 3 }, (_, i) =>
        createRow(i + 1, undefined, undefined, "user_A")
      );
      const tx = createMockTx(
        clusterRows,
        mock().mockRejectedValue(new Error("insert failed"))
      );

      databaseService.db.transaction.mockImplementation(
        async (fn: (txArg: unknown) => unknown) => fn(tx)
      );

      await expect(
        service.compactCluster(
          "doc_1",
          clusterRows.map((r) => r.id)
        )
      ).rejects.toThrow("insert failed");
    });
  });

  describe("compactRecentClusters", () => {
    it("compacts all clusters returned by findCompactableClusters", async () => {
      const findSpy = spyOn(
        service,
        "findCompactableClusters"
      ).mockResolvedValue([
        { documentId: "doc_1", ids: ["u1", "u2", "u3"] },
        { documentId: "doc_2", ids: ["u4", "u5", "u6"] },
      ]);
      const compactSpy = spyOn(service, "compactCluster").mockResolvedValue(
        true
      );

      await service.compactRecentClusters();

      expect(findSpy).toHaveBeenCalledTimes(1);
      expect(compactSpy).toHaveBeenCalledTimes(2);
      expect(compactSpy).toHaveBeenCalledWith("doc_1", ["u1", "u2", "u3"]);
      expect(compactSpy).toHaveBeenCalledWith("doc_2", ["u4", "u5", "u6"]);
    });

    it("continues to next cluster when one fails", async () => {
      spyOn(service, "findCompactableClusters").mockResolvedValue([
        { documentId: "doc_bad", ids: ["u1", "u2", "u3"] },
        { documentId: "doc_ok", ids: ["u4", "u5", "u6"] },
      ]);
      const compactSpy = spyOn(service, "compactCluster")
        .mockRejectedValueOnce(new Error("bad cluster"))
        .mockResolvedValueOnce(true);

      await service.compactRecentClusters();

      expect(compactSpy).toHaveBeenCalledTimes(2);
    });

    it("does nothing when no clusters qualify", async () => {
      spyOn(service, "findCompactableClusters").mockResolvedValue([]);
      const compactSpy = spyOn(service, "compactCluster");

      await service.compactRecentClusters();

      expect(compactSpy).not.toHaveBeenCalled();
    });
  });
});
