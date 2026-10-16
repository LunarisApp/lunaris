import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { EncryptionKeyController } from "./encryption-key.controller";
import { EncryptionKeyService } from "./encryption-key.service";

describe("EncryptionKeyController", () => {
  let controller: EncryptionKeyController;
  let service: { derive: ReturnType<typeof mock> };

  beforeEach(async () => {
    service = { derive: mock(() => "a".repeat(64)) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncryptionKeyController],
      providers: [{ provide: EncryptionKeyService, useValue: service }],
    }).compile();

    controller = module.get(EncryptionKeyController);
  });

  it("derives from the session record id, not the user id", () => {
    const session = {
      user: { id: "user-1", isAnonymous: false },
      session: { id: "session-42", activeOrganizationId: "org-1" },
    } as any;

    const result = controller.getEncryptionKey(session);

    expect(service.derive).toHaveBeenCalledWith("session-42");
    expect(result).toEqual({ key: "a".repeat(64) });
  });

  it("works for anonymous sessions", () => {
    const session = {
      user: { id: "anon-1", isAnonymous: true },
      session: { id: "session-anon", activeOrganizationId: null },
    } as any;

    const result = controller.getEncryptionKey(session);

    expect(service.derive).toHaveBeenCalledWith("session-anon");
    expect(result).toEqual({ key: "a".repeat(64) });
  });
});
