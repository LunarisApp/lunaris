import { ConflictException, ForbiddenException } from "@nestjs/common";
import { OFFICIAL_MARKETPLACE_LOCATION } from "@lunarisapp/plugin-sdk/marketplace";
import { describe, expect, it, mock } from "bun:test";
import { ExtensionRegistriesService } from "./extension-registries.service";

function awaitable(rows: unknown[]) {
  const result = {
    for: mock(() => Promise.resolve(rows)),
    limit: mock(() => result),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return result;
}

describe("ExtensionRegistriesService", () => {
  it("rejects removal while a workspace installation references the registry", async () => {
    const results = [
      [{ enabled: true }],
      [{ id: "registry-1", official: false }],
      [{ extensionId: "com.example.plugin" }],
    ];
    const deleteRegistry = mock();
    const tx = {
      delete: deleteRegistry,
      select: mock(() => ({
        from: mock(() => ({
          innerJoin: mock(() => ({
            where: mock(() => awaitable(results.shift() ?? [])),
          })),
          where: mock(() => awaitable(results.shift() ?? [])),
        })),
      })),
    };
    const db = {
      ...tx,
      transaction: mock(async (operation: (value: typeof tx) => unknown) =>
        operation(tx)
      ),
    };
    const service = new ExtensionRegistriesService({ db } as never);

    await expect(service.remove("org-1", "registry-1")).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(deleteRegistry).not.toHaveBeenCalled();
  });
});

function databaseWithRows(rows: unknown[]) {
  const read = awaitable(rows);
  const tx = {
    select: mock(() => ({
      from: mock(() => ({ where: mock(() => read) })),
    })),
    insert: mock(),
    delete: mock(),
  };
  return {
    read,
    db: {
      ...tx,
      transaction: mock(async (operation: (value: typeof tx) => unknown) =>
        operation(tx)
      ),
    },
  };
}

describe("developer mode access", () => {
  for (const role of ["admin", "editor", "viewer", undefined]) {
    it(`rejects marketplace management for ${role ?? "non-members"}`, async () => {
      const database = databaseWithRows(role ? [{ role }] : []);
      const service = new ExtensionRegistriesService(database as never);
      await expect(
        service.requireOwner("org-1", "user-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  }

  it("allows owners", async () => {
    const service = new ExtensionRegistriesService(
      databaseWithRows([{ role: "owner" }]) as never
    );
    await expect(
      service.requireOwner("org-1", "owner-1")
    ).resolves.toBeUndefined();
  });

  it("rejects adding and removing custom marketplaces when disabled, before writing", async () => {
    const database = databaseWithRows([{ enabled: false }]);
    const service = new ExtensionRegistriesService(database as never);
    await expect(
      service.add("org-1", "https://example.com/marketplace.json", "owner-1")
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove("org-1", "registry-1")).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(database.db.insert).not.toHaveBeenCalled();
    expect(database.db.delete).not.toHaveBeenCalled();
    expect(database.read.for).toHaveBeenCalledWith("share");
  });

  it("keeps the official marketplace protected when enabled", async () => {
    const service = new ExtensionRegistriesService(
      databaseWithRows([{ enabled: true }]) as never
    );
    await expect(
      service.add("org-1", OFFICIAL_MARKETPLACE_LOCATION, "owner-1")
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("marketplace duplicate errors", () => {
  for (const wrapped of [false, true]) {
    it(`returns a conflict for ${wrapped ? "wrapped" : "direct"} Postgres unique violations`, async () => {
      const database = databaseWithRows([{ enabled: true }]);
      const postgresError = Object.assign(new Error("duplicate"), {
        code: "23505",
      });
      const failure = wrapped
        ? new Error("Query failed", { cause: postgresError })
        : postgresError;
      database.db.insert.mockImplementation(() => {
        throw failure;
      });
      const service = new ExtensionRegistriesService(database as never);
      await expect(
        service.add("org-1", "https://example.com/marketplace.json", "owner-1")
      ).rejects.toBeInstanceOf(ConflictException);
      expect(database.read.for).toHaveBeenCalledWith("share");
    });
  }
});
