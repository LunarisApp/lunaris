import { describe, expect, test } from "bun:test";
import {
	ReleaseDownloadError,
	type SignedReleaseDownload,
} from "@/lib/release-downloads";
import { handleVersionedDownload } from "./route";

function context(target: string, version: string, filename: string) {
	return {
		params: Promise.resolve({
			filename,
			target,
			version,
		}),
	};
}

function dependencies(
	resolve: (
		target: "cli" | "macos",
		version: string,
		filename: string,
	) => Promise<SignedReleaseDownload>,
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

describe("versioned download route", () => {
	test("redirects an exact CLI artifact without caching", async () => {
		const filename = "lunaris-cli-1.2.3-universal-apple-darwin.zip";
		const state = dependencies((target, version, requestedFilename) => {
			expect({ requestedFilename, target, version }).toEqual({
				requestedFilename: filename,
				target: "cli",
				version: "1.2.3",
			});
			return Promise.resolve({
				component: "cli",
				signingMode: "signed",
				url: "https://storage.example.test/signed-cli",
				version,
			});
		});

		const response = await handleVersionedDownload(
			new Request(`https://lunaris.app/download/cli/1.2.3/${filename}`),
			context("cli", "1.2.3", filename),
			state.dependencies,
		);

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(
			"https://storage.example.test/signed-cli",
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(state.errors).toHaveLength(0);
		expect(state.events).toContainEqual({
			download: {
				component: "cli",
				filename,
				outcome: "redirect",
				signingMode: "signed",
				target: "cli",
				version: "1.2.3",
			},
		});
	});

	test.each([
		["windows", "1.2.3"],
		["cli", "1.2"],
	])("rejects invalid target %s or version %s", async (target, version) => {
		const state = dependencies(() =>
			Promise.reject(new Error("must not resolve")),
		);
		const response = await handleVersionedDownload(
			new Request(`https://lunaris.app/download/${target}/${version}/asset`),
			context(target, version, "asset"),
			state.dependencies,
		);

		expect(response.status).toBe(404);
		expect(state.errors).toHaveLength(0);
	});

	test("returns 404 when the artifact does not exist", async () => {
		const state = dependencies(() =>
			Promise.reject(new ReleaseDownloadError("not_found", "Artifact missing")),
		);
		const response = await handleVersionedDownload(
			new Request("https://lunaris.app/download/macos/2.0.0/missing.dmg"),
			context("macos", "2.0.0", "missing.dmg"),
			state.dependencies,
		);

		expect(response.status).toBe(404);
		expect(state.errors).toHaveLength(0);
		expect(state.events).toContainEqual({
			download: {
				component: "desktop",
				errorKind: "not_found",
				filename: "missing.dmg",
				outcome: "not_found",
				target: "macos",
				version: "2.0.0",
			},
		});
	});

	test.each(["configuration", "invalid_manifest", "storage"] as const)(
		"returns 503 and logs %s failures",
		async (kind) => {
			const error = new ReleaseDownloadError(kind, "Release unavailable");
			const state = dependencies(() => Promise.reject(error));
			const response = await handleVersionedDownload(
				new Request("https://lunaris.app/download/macos/2.0.0/Lunaris.dmg"),
				context("macos", "2.0.0", "Lunaris.dmg"),
				state.dependencies,
			);

			expect(response.status).toBe(503);
			expect(state.errors).toEqual([error]);
		},
	);
});
