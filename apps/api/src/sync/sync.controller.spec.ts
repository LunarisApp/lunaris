import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { DatabaseService } from "@app/db";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { AppConfig } from "../app.config";
import {
  EntitlementsService,
  OrganizationMembershipRequiredError,
} from "../entitlements";
import { PermissionService } from "../security/permissions/permission.service";
import { SyncController } from "./sync.controller";
import {
  LocalOnlySyncAccessError,
  NoActiveOrganizationError,
} from "./sync.errors";
import { SyncService } from "./sync.service";

describe("SyncController", () => {
  let controller: SyncController;
  let assertOrganizationMember: ReturnType<typeof mock>;
  let service: SyncService;

  beforeEach(async () => {
    assertOrganizationMember = mock(async () => undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        SyncService,
        { provide: DatabaseService, useValue: { db: {} } },
        {
          provide: EntitlementsService,
          useValue: {
            assertCanCreateResource: mock(async () => undefined),
            assertOrganizationMember,
          },
        },
        {
          provide: PermissionService,
          useValue: { requirePermission: mock(async () => undefined) },
        },
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        { provide: AuthService, useValue: new (AuthService as any)() },
      ],
    }).compile();

    controller = module.get<SyncController>(SyncController);
    service = module.get<SyncService>(SyncService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getCredentials", () => {
    it("should throw when no activeOrganizationId", async () => {
      const session = {
        user: { id: "user-1", isAnonymous: false },
        session: { activeOrganizationId: null },
      } as any;

      await expect(controller.getCredentials(session)).rejects.toThrow(
        NoActiveOrganizationError,
      );
    });

    it("should return token from service", async () => {
      const expected = {
        token: "jwt-abc",
        powersyncUrl: "https://ps.example.com",
        expiresAt: 1700000000,
      };
      spyOn(service, "getCredentials").mockResolvedValue(expected);

      const session = {
        user: { id: "user-1", isAnonymous: false },
        session: { activeOrganizationId: "org-1" },
      } as any;
      const result = await controller.getCredentials(session);

      expect(assertOrganizationMember).toHaveBeenCalledWith("user-1", "org-1");
      expect(service.getCredentials).toHaveBeenCalledWith(
        "user-1",
        "org-1",
        "cloud",
      );
      expect(result).toEqual(expected);
    });

    it("should reject local-only sync access for anonymous session", async () => {
      const session = {
        user: { id: "user-1", isAnonymous: true },
        session: { activeOrganizationId: "org-1" },
      } as any;

      await expect(controller.getCredentials(session)).rejects.toMatchObject({
        constructor: LocalOnlySyncAccessError,
        reason: "entitlements.local_only_anonymous",
      });
    });

    it("should reject stale organizations after membership removal", async () => {
      assertOrganizationMember.mockImplementationOnce(async () => {
        throw new OrganizationMembershipRequiredError();
      });
      const getCredentials = spyOn(service, "getCredentials");
      const session = {
        user: { id: "removed-user", isAnonymous: false },
        session: { activeOrganizationId: "org-1" },
      } as any;

      await expect(controller.getCredentials(session)).rejects.toBeInstanceOf(
        OrganizationMembershipRequiredError,
      );
      expect(getCredentials).not.toHaveBeenCalled();
    });
  });

  describe("ingest", () => {
    it("should call service.ingest with organizationId and userId", async () => {
      spyOn(service, "ingest").mockResolvedValue(undefined);

      const session = {
        user: { id: "user-1", isAnonymous: false },
        session: { activeOrganizationId: "org-1" },
      } as any;
      const body = { transactions: [{ crud: [] }] };
      const result = await controller.ingest(session, body as any);

      expect(assertOrganizationMember).toHaveBeenCalledWith("user-1", "org-1");
      expect(service.ingest).toHaveBeenCalledWith(
        body.transactions,
        "org-1",
        "user-1",
      );
      expect(result).toEqual({});
    });

    it("should throw when no active organization", async () => {
      const session = {
        user: { id: "user-1", isAnonymous: false },
        session: { activeOrganizationId: null },
      } as any;

      await expect(
        controller.ingest(session, { transactions: [] } as any),
      ).rejects.toThrow(NoActiveOrganizationError);
    });

    it("should reject local-only sync access", async () => {
      const session = {
        user: { id: "user-1", isAnonymous: true },
        session: { activeOrganizationId: "org-1" },
      } as any;

      await expect(
        controller.ingest(session, { transactions: [] } as any),
      ).rejects.toThrow(LocalOnlySyncAccessError);
    });

    it("should reject ingest after membership removal", async () => {
      assertOrganizationMember.mockImplementationOnce(async () => {
        throw new OrganizationMembershipRequiredError();
      });
      const ingest = spyOn(service, "ingest");
      const session = {
        user: { id: "removed-user", isAnonymous: false },
        session: { activeOrganizationId: "org-1" },
      } as any;

      await expect(
        controller.ingest(session, { transactions: [] } as any),
      ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
      expect(ingest).not.toHaveBeenCalled();
    });
  });
});
