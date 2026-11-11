import { describe, expect, test } from "bun:test";
import {
	ReleaseDownloadError,
	type SignedReleaseDownload,
	type ReleaseTarget,
} from "@/lib/release-downloads";
import { handleDownload } from "./route";

function context(target: string) {
	return {
		params: Promise.resolve({ locale: "en", target }),
	};
}

function dependencies(
	resolve: (target: ReleaseTarget) => Promise<SignedReleaseDownload>,
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
	test("redirects macOS downloads without caching the redirect", async () => {
		const state = dependencies(() =>
			Promise.resolve({
				component: "desktop",
				signingMode: "signed",
				url: "https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/Lunaris-desktop-1.2.3-universal.dmg",
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
			"https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/Lunaris-desktop-1.2.3-universal.dmg",
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
				url: "https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/lunaris-cli-1.2.3-universal-apple-darwin.zip",
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
			"https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/lunaris-cli-1.2.3-universal-apple-darwin.zip",
		);
	});

	test.each(["windows", "linux"] as const)(
		"redirects %s directly to GitHub asset",
		async (target) => {
			const url = `https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/installer.${target === "windows" ? "exe" : "deb"}`;
			const state = dependencies(async (requestedTarget) => {
				expect(requestedTarget).toBe(target);
				return {
					component: "desktop",
					signingMode: "unsigned",
					url,
					version: "1.2.3",
				};
			});
			const response = await handleDownload(
				new Request(`https://lunaris.app/download/${target}`),
				context(target),
				state.dependencies,
			);
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(url);
			expect(await response.text()).toBe("");
		},
	);

	test("returns 404 for an unsupported target", async () => {
		const state = dependencies(() =>
			Promise.reject(new Error("must not resolve")),
		);
		const response = await handleDownload(
			new Request("https://lunaris.app/download/android"),
			context("android"),
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
