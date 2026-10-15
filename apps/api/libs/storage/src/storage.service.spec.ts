import { beforeEach, describe, expect, it, mock } from "bun:test";
import { InternalServerErrorException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { StorageConfig } from "./storage.config";
import { StorageService } from "./storage.service";

// biome-ignore lint/suspicious/noExplicitAny: test mocks
const mockSend = mock(() => Promise.resolve({})) as any;
const mockDestroy = mock(() => {});
const mockRawClient = { config: {}, send: mockSend, destroy: mockDestroy };
const mockUpload = mock(() => Promise.resolve({ key: "test-key" }));
const mockDownload = mock(() => Promise.resolve({ key: "test-key" }));
const mockDelete = mock(() => Promise.resolve());
const mockUrl = mock(() => Promise.resolve("https://signed-url.example.com"));
const mockSignedUploadUrl = mock(() =>
	Promise.resolve({
		method: "PUT" as const,
		url: "https://signed-upload.example.com",
	}),
);
const mockS3 = mock(() => ({ raw: mockRawClient }));

mock.module("@aws-sdk/client-s3", () => ({
	HeadBucketCommand: class {
		constructor(public readonly input: { Bucket: string }) {}
	},
}));

mock.module("files-sdk/s3", () => ({
	s3: mockS3,
}));

mock.module("files-sdk", () => ({
	Files: class {
		readonly raw = mockRawClient;
		upload = mockUpload;
		download = mockDownload;
		delete = mockDelete;
		url = mockUrl;
		signedUploadUrl = mockSignedUploadUrl;
		constructor(public readonly options: unknown) {}
	},
}));

const TEST_CONFIG: StorageConfig = {
	endpoint: "https://s3.example.com",
  publicEndpoint: "https://s3.example.com",
	region: "us-east-1",
	bucket: "test-bucket",
	accessKeyId: "test-key",
	secretAccessKey: "test-secret",
};

describe("StorageService", () => {
	let service: StorageService;

	beforeEach(async () => {
		mockSend.mockReset().mockImplementation(() => Promise.resolve({}));
		mockDestroy.mockReset();
		mockUpload.mockReset().mockResolvedValue({ key: "test-key" });
		mockDownload.mockReset().mockResolvedValue({ key: "test-key" });
		mockDelete.mockReset().mockResolvedValue(undefined);
		mockUrl
			.mockReset()
			.mockResolvedValue("https://signed-url.example.com");
		mockSignedUploadUrl.mockReset().mockResolvedValue({
			method: "PUT",
			url: "https://signed-upload.example.com",
		});
		mockS3.mockClear();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageService,
				{ provide: StorageConfig, useValue: TEST_CONFIG },
			],
		}).compile();

		service = module.get<StorageService>(StorageService);
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	it("should configure files-sdk S3 adapter from config", () => {
		expect(mockS3).toHaveBeenCalledWith({
			bucket: "test-bucket",
			endpoint: "https://s3.example.com",
			region: "us-east-1",
			credentials: {
				accessKeyId: "test-key",
				secretAccessKey: "test-secret",
			},
			forcePathStyle: true,
		});
	});

	it("should expose bucket from config", () => {
		expect(service.bucket).toBe("test-bucket");
	});

	describe("onModuleInit", () => {
		it("should verify bucket via HeadBucket", async () => {
			await service.onModuleInit();
			expect(mockSend).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: test mock introspection
			const command = (mockSend as any).mock.calls[0][0];
			expect(command.input.Bucket).toBe("test-bucket");
		});

		it("should throw when HeadBucket fails", async () => {
			mockSend.mockImplementationOnce(() =>
				Promise.reject(new Error("Bucket not found")),
			);
			await expect(service.onModuleInit()).rejects.toThrow(
				"Bucket not found",
			);
		});
	});

	describe("onModuleDestroy", () => {
		it("should destroy the raw client", async () => {
			await service.onModuleDestroy();
			expect(mockDestroy).toHaveBeenCalledTimes(1);
		});
	});

	describe("verifyBucket", () => {
		it("should verify bucket via raw client without exposing it", async () => {
			await service.verifyBucket();
			expect(mockSend).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: test mock introspection
			const command = (mockSend as any).mock.calls[0][0];
			expect(command.input.Bucket).toBe("test-bucket");
		});
	});

	describe("putObject", () => {
		it("should upload through files-sdk", async () => {
			await service.putObject(
				"test-key",
				Buffer.from("data"),
				"text/plain",
			);
			expect(mockUpload).toHaveBeenCalledWith(
				"test-key",
				Buffer.from("data"),
				{ contentType: "text/plain" },
			);
		});

		it("should allow contentType to be omitted", async () => {
			await service.putObject("key", Buffer.from("data"));
			expect(mockUpload).toHaveBeenCalledWith("key", Buffer.from("data"), {
				contentType: undefined,
			});
		});
	});

	describe("getObject", () => {
		it("should download through files-sdk", async () => {
			await service.getObject("test-key");
			expect(mockDownload).toHaveBeenCalledWith("test-key");
		});
	});

	describe("deleteObject", () => {
		it("should delete through files-sdk", async () => {
			await service.deleteObject("test-key");
			expect(mockDelete).toHaveBeenCalledWith("test-key");
		});
	});

	describe("getSignedDownloadUrl", () => {
		it("should return a signed URL string", async () => {
			const url = await service.getSignedDownloadUrl("test-key");
			expect(url).toBe("https://signed-url.example.com");
		});

		it("should use default expiresIn of 3600", async () => {
			await service.getSignedDownloadUrl("test-key");
			expect(mockUrl).toHaveBeenCalledWith("test-key", { expiresIn: 3600 });
		});

		it("should use custom expiresIn when provided", async () => {
			await service.getSignedDownloadUrl("test-key", 600);
			expect(mockUrl).toHaveBeenCalledWith("test-key", { expiresIn: 600 });
		});
	});

	describe("getSignedUploadUrl", () => {
		it("should return PUT signed upload URL string", async () => {
			const url = await service.getSignedUploadUrl(
				"test-key",
				"image/png",
			);
			expect(url).toBe("https://signed-upload.example.com");
			expect(mockSignedUploadUrl).toHaveBeenCalledWith("test-key", {
				contentType: "image/png",
				expiresIn: 3600,
			});
		});

		it("should use custom expiresIn when provided", async () => {
			await service.getSignedUploadUrl("test-key", "image/png", 600);
			expect(mockSignedUploadUrl).toHaveBeenCalledWith("test-key", {
				contentType: "image/png",
				expiresIn: 600,
			});
		});

		it("should reject unsupported signed upload method", async () => {
			mockSignedUploadUrl.mockResolvedValueOnce({
				method: "POST",
				url: "https://signed-upload.example.com",
				fields: {},
			} as never);

			await expect(service.getSignedUploadUrl("test-key")).rejects.toThrow(
				InternalServerErrorException,
			);
		});
	});
});
