import { beforeEach, describe, expect, it, mock } from "bun:test";
import { StorageService } from "@app/storage";
import { HealthIndicatorService } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { StorageHealthIndicator } from "./storage.health";

const mockVerifyBucket = mock(() => Promise.resolve());

const UP_RESULT = { "storage_bucket": { status: "up" } };
const DOWN_RESULT = { "storage_bucket": { status: "down" } };
const mockUp = mock(() => UP_RESULT);
const mockDown = mock(() => DOWN_RESULT);
const mockCheck = mock(() => ({ up: mockUp, down: mockDown }));

describe("StorageHealthIndicator", () => {
	let indicator: StorageHealthIndicator;

	beforeEach(async () => {
		mockVerifyBucket.mockReset().mockImplementation(() => Promise.resolve());
		mockUp.mockReset().mockImplementation(() => UP_RESULT);
		mockDown.mockReset().mockImplementation(() => DOWN_RESULT);
		mockCheck
			.mockReset()
			.mockImplementation(() => ({ up: mockUp, down: mockDown }));

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageHealthIndicator,
				{
					provide: StorageService,
					useValue: {
						verifyBucket: mockVerifyBucket,
					},
				},
				{
					provide: HealthIndicatorService,
					useValue: { check: mockCheck },
				},
			],
		}).compile();

		indicator = module.get<StorageHealthIndicator>(StorageHealthIndicator);
	});

	it("should return up when bucket is reachable", async () => {
		await indicator.isHealthy();
		expect(mockVerifyBucket).toHaveBeenCalledTimes(1);
		expect(mockUp).toHaveBeenCalledTimes(1);
		expect(mockDown).not.toHaveBeenCalled();
	});

	it("should return down when bucket is unreachable", async () => {
		mockVerifyBucket.mockImplementationOnce(() =>
			Promise.reject(new Error("Network error")),
		);
		await indicator.isHealthy();
		expect(mockDown).toHaveBeenCalledTimes(1);
		expect(mockUp).not.toHaveBeenCalled();
	});
});
