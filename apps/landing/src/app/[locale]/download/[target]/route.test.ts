import { describe, expect, test } from "bun:test";
import {
	ReleaseDownloadError,
	type SignedReleaseDownload,
} from "@/lib/release-downloads";
import { handleDownload } from "./route";

function context(target: string) {
	return {
		params: Promise.resolve({ locale: "en", target }),
	};
}

function dependencies(
	resolve: (target: "cli" | "macos") => Promise<SignedReleaseDownload>,
) {
	const events: Record<string, unknown>[] = [];
	const errors: Error[] = [];
	return {
		dependencies: {
			log: {
				error(error: Error) {
					errors.push(error);
				},
				set(event: Record<string, unknown>) {
					events.push(event);
				},
			},
			resolve,
		},
		errors,
		events,
	};
}

describe("download route", () => {
	test("redirects macOS downloads without caching the signed URL", async () => {
		const state = dependencies(() =>
			Promise.resolve({
				component: "desktop",
				signingMode: "signed",
				url: "https://storage.example.test/signed",
				version: "1.2.3",
			}),
		);

		const response = await handleDownload(
			new Request("https://lunaris.app/download/macos"),
			context("macos"),
			state.dependencies,
		);

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(
			"https://storage.example.test/signed",
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(state.errors).toHaveLength(0);
		expect(state.events).toContainEqual({
			download: {
				component: "desktop",
				outcome: "redirect",
				signingMode: "signed",
				target: "macos",
				version: "1.2.3",
			},
		});
	});

	test("redirects CLI downloads", async () => {
		const state = dependencies(() =>
			Promise.resolve({
				component: "cli",
				signingMode: "adhoc",
				url: "https://storage.example.test/signed-cli",
				version: "2.0.0",
			}),
		);

		const response = await handleDownload(
			new Request("https://lunaris.app/download/cli"),
			context("cli"),
			state.dependencies,
		);

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(
			"https://storage.example.test/signed-cli",
		);
	});

	test("returns 404 for an unsupported target", async () => {
		const state = dependencies(() =>
			Promise.reject(new Error("must not resolve")),
		);
		const response = await handleDownload(
			new Request("https://lunaris.app/download/windows"),
			context("windows"),
			state.dependencies,
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(state.errors).toHaveLength(0);
	});

	test("returns 503 when no release exists", async () => {
		const state = dependencies(() =>
			Promise.reject(
				new ReleaseDownloadError("not_found", "Latest release missing"),
			),
		);
		const response = await handleDownload(
			new Request("https://lunaris.app/download/macos"),
			context("macos"),
			state.dependencies,
		);

		expect(response.status).toBe(503);
		expect(state.errors).toHaveLength(1);
		expect(state.events).toContainEqual({
			download: {
				component: "desktop",
				errorKind: "not_found",
				outcome: "unavailable",
				target: "macos",
			},
		});
	});

	test.each([
		["configuration", "Storage configuration missing"],
		["invalid_manifest", "Manifest invalid"],
		["storage", "Storage unavailable"],
	] as const)("returns 503 and logs %s failures", async (kind, message) => {
		const error = new ReleaseDownloadError(kind, message);
		const state = dependencies(() => Promise.reject(error));
		const response = await handleDownload(
			new Request("https://lunaris.app/download/cli"),
			context("cli"),
			state.dependencies,
		);

		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(state.errors).toEqual([error]);
	});
});
