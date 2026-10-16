import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEncryptionKeyVault,
  deleteEncryptionKeyVaultRecord,
  readEncryptionKeyVaultRecord,
  writeEncryptionKeyVaultRecord,
} from "./key-vault";

const FIRST_RECORD = {
  id: "first",
  key: "a".repeat(64),
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const SECOND_RECORD = {
  id: "second",
  key: "b".repeat(64),
  updatedAt: "2026-07-14T00:00:01.000Z",
};

describe("encryption key vault storage", () => {
  beforeEach(clearEncryptionKeyVault);

  it("round-trips records", async () => {
    await writeEncryptionKeyVaultRecord(FIRST_RECORD);

    await expect(
      readEncryptionKeyVaultRecord(FIRST_RECORD.id)
    ).resolves.toEqual(FIRST_RECORD);
  });

  it("deletes one record without affecting another", async () => {
    await writeEncryptionKeyVaultRecord(FIRST_RECORD);
    await writeEncryptionKeyVaultRecord(SECOND_RECORD);

    await deleteEncryptionKeyVaultRecord(FIRST_RECORD.id);

    await expect(
      readEncryptionKeyVaultRecord(FIRST_RECORD.id)
    ).resolves.toBeNull();
    await expect(
      readEncryptionKeyVaultRecord(SECOND_RECORD.id)
    ).resolves.toEqual(SECOND_RECORD);
  });

  it("clears every record", async () => {
    await writeEncryptionKeyVaultRecord(FIRST_RECORD);
    await writeEncryptionKeyVaultRecord(SECOND_RECORD);

    await clearEncryptionKeyVault();

    await expect(
      readEncryptionKeyVaultRecord(FIRST_RECORD.id)
    ).resolves.toBeNull();
    await expect(
      readEncryptionKeyVaultRecord(SECOND_RECORD.id)
    ).resolves.toBeNull();
  });
});
