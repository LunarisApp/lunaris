import { beforeEach, describe, expect, it } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { AppConfig } from "../../app.config";
import { EncryptionKeyService } from "./encryption-key.service";

const TEST_MASTER =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

describe("EncryptionKeyService", () => {
  let service: EncryptionKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionKeyService,
        {
          provide: AppConfig,
          useValue: { localDbEncryptionMasterKey: TEST_MASTER },
        },
      ],
    }).compile();

    service = module.get(EncryptionKeyService);
  });

  it("returns a 64-char hex string (256-bit key)", () => {
    const key = service.derive("session-abc");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same master + session id", () => {
    expect(service.derive("session-abc")).toEqual(
      service.derive("session-abc")
    );
  });

  it("returns different keys for different session ids", () => {
    expect(service.derive("session-abc")).not.toEqual(
      service.derive("session-xyz")
    );
  });

  it("matches a known derivation (regression guard on salt/info)", () => {
    // Snapshot: any change to HKDF salt, info, or algorithm breaks this test
    // visibly. Existing client-side encrypted DBs would become unreadable.
    expect(service.derive("fixed-session-id")).toEqual(
      "b80077b8f9cc758f00a7f56354ba60aa0781e9ed20dbfa35350c6970d0b58d91"
    );
  });
});
