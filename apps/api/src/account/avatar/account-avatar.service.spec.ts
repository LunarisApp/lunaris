import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { DatabaseService } from "@app/db";
import { StorageConfig, StorageService } from "@app/storage";
import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AvatarService } from "./account-avatar.service";

const TEST_CONFIG: StorageConfig = {
	endpoint: "https://s3.example.com",
  publicEndpoint: "https://s3.example.com",
	region: "us-east-1",
	bucket: "test-bucket",
	accessKeyId: "test-key",
	secretAccessKey: "test-secret",
};

const mockSelect = mock(() => ({ from: mockFrom }));
const mockFrom = mock(() => ({ where: mockWhere }));
// biome-ignore lint/suspicious/noExplicitAny: test mock
const mockWhere = mock(() => Promise.resolve([{ image: null }])) as any;
const mockUpdate = mock(() => ({ set: mockSet }));
const mockSet = mock(() => ({ where: mockUpdateWhere }));
const mockUpdateWhere = mock(() => Promise.resolve());

const mockDb = {
	db: {
		select: mockSelect,
		update: mockUpdate,
	},
};

const mockStorageService = {
	getSignedUploadUrl: mock(() =>
		Promise.resolve("https://signed-url.example.com"),
	),
	deleteObject: mock(() => Promise.resolve()),
};

describe("AvatarService", () => {
	let service: AvatarService;

	beforeEach(async () => {
		mockSelect.mockReset().mockReturnValue({ from: mockFrom });
		mockFrom.mockReset().mockReturnValue({ where: mockWhere });
		mockWhere.mockReset().mockResolvedValue([{ image: null }]);
		mockUpdate.mockReset().mockReturnValue({ set: mockSet });
		mockSet.mockReset().mockReturnValue({ where: mockUpdateWhere });
		mockUpdateWhere.mockReset().mockResolvedValue(undefined);
		mockStorageService.getSignedUploadUrl
			.mockReset()
			.mockResolvedValue("https://signed-url.example.com");
		mockStorageService.deleteObject.mockReset().mockResolvedValue(undefined);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AvatarService,
				{ provide: StorageService, useValue: mockStorageService },
				// biome-ignore lint/suspicious/noExplicitAny: test mock
				{ provide: DatabaseService, useValue: mockDb as any },
				{ provide: StorageConfig, useValue: TEST_CONFIG },
			],
		}).compile();

		service = module.get<AvatarService>(AvatarService);
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	describe("getUploadUrl", () => {
		it("should generate correct key format and return presigned URL", async () => {
			const result = await service.getUploadUrl("user-1", "image/webp");

			expect(result.key).toStartWith("avatars/user-1/");
			expect(result.key).toEndWith(".webp");
			expect(result.uploadUrl).toBe("https://signed-url.example.com");
			expect(result.publicUrl).toBe(
				`https://s3.example.com/test-bucket/${result.key}`,
			);
			expect(mockStorageService.getSignedUploadUrl).toHaveBeenCalledWith(
				result.key,
				"image/webp",
				600,
			);
		});
	});

	describe("confirmUpload", () => {
		it("should validate key, update user image, and return imageUrl", async () => {
			const key = "avatars/user-1/123.webp";
			const result = await service.confirmUpload("user-1", key);

			expect(result.imageUrl).toBe(
				"https://s3.example.com/test-bucket/avatars/user-1/123.webp",
			);
			expect(mockUpdate).toHaveBeenCalled();
		});

		it("should delete old S3 avatar when one exists", async () => {
			const oldUrl =
				"https://s3.example.com/test-bucket/avatars/user-1/old.webp";
			mockWhere.mockReset().mockResolvedValue([{ image: oldUrl }]);

			const key = "avatars/user-1/new.webp";
			await service.confirmUpload("user-1", key);

			expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
				"avatars/user-1/old.webp",
			);
		});

		it("should skip deleteObject when image is null", async () => {
			mockWhere.mockReset().mockResolvedValue([{ image: null }]);

			const key = "avatars/user-1/123.webp";
			await service.confirmUpload("user-1", key);

			expect(mockStorageService.deleteObject).not.toHaveBeenCalled();
		});

		it("should throw ForbiddenException for key prefix mismatch", async () => {
			const key = "avatars/other-user/file.webp";

			await expect(
				service.confirmUpload("user-1", key),
			).rejects.toThrow(ForbiddenException);
		});

		it("should log warning and still succeed when deleteObject fails", async () => {
			const oldUrl =
				"https://s3.example.com/test-bucket/avatars/user-1/old.webp";
			mockWhere.mockReset().mockResolvedValue([{ image: oldUrl }]);
			mockStorageService.deleteObject
				.mockReset()
				.mockRejectedValue(new Error("S3 error"));

			const key = "avatars/user-1/new.webp";
			const result = await service.confirmUpload("user-1", key);

			expect(result.imageUrl).toBe(
				"https://s3.example.com/test-bucket/avatars/user-1/new.webp",
			);
		});
	});
});
