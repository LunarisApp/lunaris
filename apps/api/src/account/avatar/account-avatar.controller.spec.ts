import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppConfig } from "../../app.config";
import { AvatarController } from "./account-avatar.controller";
import { AvatarService } from "./account-avatar.service";

const mockAvatarService = {
  getUploadUrl: async () => ({
    uploadUrl: "https://signed-url.example.com",
    key: "avatars/user-1/123.webp",
    publicUrl: "https://s3.example.com/test-bucket/avatars/user-1/123.webp",
  }),
  confirmUpload: async () => ({
    imageUrl: "https://s3.example.com/test-bucket/avatars/user-1/123.webp",
  }),
};

describe("AvatarController", () => {
  let controller: AvatarController;
  let service: typeof mockAvatarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvatarController],
      providers: [{ provide: AvatarService, useValue: mockAvatarService }],
    }).compile();

    controller = module.get<AvatarController>(AvatarController);
    service = module.get(AvatarService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getUploadUrl", () => {
    it("should call service.getUploadUrl with correct args", async () => {
      const spy = spyOn(service, "getUploadUrl");
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const session = { user: { id: "user-1" } } as any;
      const body = { resource: "image/webp" as const };

      const result = await controller.getUploadUrl(session, body);

      expect(spy).toHaveBeenCalledWith("user-1", "image/webp");
      expect(result.uploadUrl).toBe("https://signed-url.example.com");
    });
  });

  describe("confirmUpload", () => {
    it("should call service.confirmUpload with correct args", async () => {
      const spy = spyOn(service, "confirmUpload");
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const session = { user: { id: "user-1" } } as any;
      const body = { key: "avatars/user-1/123.webp" };

      const result = await controller.confirmUpload(session, body);

      expect(spy).toHaveBeenCalledWith("user-1", "avatars/user-1/123.webp");
      expect(result.imageUrl).toBe(
        "https://s3.example.com/test-bucket/avatars/user-1/123.webp",
      );
    });
  });
});
