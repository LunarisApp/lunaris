import { describe, expect, test } from "bun:test";
import {
	resolveGithubReleaseDownload,
	resolveReleaseDownload,
	resolveVersionedReleaseDownload,
	ReleaseDownloadError,
} from "./release-downloads";

describe("GitHub desktop downloads", () => {
	const assetName = "Lunaris-desktop-1.2.3-universal-adhoc.dmg";
	const release = {
		tag_name: "v1.2.3",
		draft: false,
		prerelease: false,
		assets: [{ name: assetName, size: 1024, state: "uploaded" }],
	};
	test("resolves latest and versioned installers without S3", async () => {
		const calls: string[] = [];
		const request = (path: string) => {
			calls.push(path);
			return Promise.resolve(Response.json(release));
		};
		const latest = await resolveGithubReleaseDownload(
			undefined,
			undefined,
			request,
		);
		expect(latest).toEqual({
			component: "desktop",
			version: "1.2.3",
			signingMode: "adhoc",
			url: `https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/${assetName}`,
		});
		expect(
			await resolveGithubReleaseDownload("1.2.3", assetName, request),
		).toEqual(latest);
		expect(calls).toEqual(["latest", "tags/v1.2.3"]);
	});
	test("keeps historical desktop tags downloadable", async () => {
		const calls: string[] = [];
		const result = await resolveGithubReleaseDownload(
			"1.2.3",
			assetName,
			(path) => {
				calls.push(path);
				return Promise.resolve(
					path === "tags/v1.2.3"
						? new Response(null, { status: 404 })
						: Response.json({ ...release, tag_name: "desktop@1.2.3" }),
				);
			},
		);
		expect(calls).toEqual(["tags/v1.2.3", "tags/desktop%401.2.3"]);
		expect(result.url).toContain("desktop%401.2.3");
	});
	test("rejects unavailable, mismatched and unpublished release assets", async () => {
		for (const data of [
			{ ...release, draft: true },
			{ ...release, prerelease: true },
			{ ...release, tag_name: "v9.0.0" },
			{ ...release, assets: [] },
		]) {
			await expect(
				resolveGithubReleaseDownload("1.2.3", assetName, () =>
					Promise.resolve(Response.json(data)),
				),
			).rejects.toBeInstanceOf(ReleaseDownloadError);
		}
		await expect(
			resolveGithubReleaseDownload("1.2.3", "different.dmg", () =>
				Promise.resolve(Response.json(release)),
			),
		).rejects.toBeInstanceOf(ReleaseDownloadError);
		await expect(
			resolveGithubReleaseDownload(undefined, undefined, () =>
				Promise.resolve(new Response(null, { status: 503 })),
			),
		).rejects.toMatchObject({ kind: "storage" });
	});
});

describe("cross-platform GitHub installers", () => {
	test.each([
		["windows", "Lunaris-desktop-1.2.3-x86_64-pc-windows-msvc.exe"],
		["linux", "Lunaris-desktop-1.2.3-x86_64-unknown-linux-gnu.deb"],
	] as const)(
		"resolves %s from a release with all platforms",
		async (target, name) => {
			const request = () =>
				Promise.resolve(
					Response.json({
						tag_name: "v1.2.3",
						draft: false,
						prerelease: false,
						assets: [name, "Lunaris-desktop-1.2.3-universal.dmg"].map(
							(name) => ({ name, size: 1024, state: "uploaded" }),
						),
					}),
				);
			const result = await resolveGithubReleaseDownload(
				undefined,
				undefined,
				request,
				target,
			);
			expect(result.url).toBe(
				`https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/${name}`,
			);
			expect(result.signingMode).toBe("unsigned");
			await expect(
				resolveGithubReleaseDownload("1.2.3", "wrong.exe", request, target),
			).rejects.toMatchObject({ kind: "not_found" });
		},
	);
});

describe("GitHub CLI downloads", () => {
	const name = "lunaris-cli-1.2.3-universal-apple-darwin.zip";
	const release = {
		tag_name: "v1.2.3",
		draft: false,
		prerelease: false,
		assets: [{ name, size: 1024, state: "uploaded" }],
	};
	test.each(["signed", "adhoc"] as const)(
		"resolves latest and versioned %s archives",
		async (signingMode) => {
			const filename =
				signingMode === "adhoc" ? name.replace(".zip", "-adhoc.zip") : name;
			const calls: string[] = [];
			const request = (path: string) => {
				calls.push(path);
				return Promise.resolve(
					Response.json({
						...release,
						assets: [
							{ name: filename, size: 1024, state: "uploaded" },
							{
								name: "Lunaris-desktop-1.2.3-universal.dmg",
								size: 2048,
								state: "uploaded",
							},
							{
								name: "Lunaris-desktop-1.2.3-x86_64-pc-windows-msvc.exe",
								size: 2048,
								state: "uploaded",
							},
							{
								name: "Lunaris-desktop-1.2.3-x86_64-unknown-linux-gnu.deb",
								size: 2048,
								state: "uploaded",
							},
							{ name: "SHA256SUMS", size: 128, state: "uploaded" },
						],
					}),
				);
			};
			const latest = await resolveReleaseDownload("cli", request);
			expect(latest).toEqual({
				component: "cli",
				signingMode,
				version: "1.2.3",
				url: `https://github.com/LunarisApp/lunaris/releases/download/v1.2.3/${filename}`,
			});
			expect(
				await resolveVersionedReleaseDownload(
					"cli",
					"1.2.3",
					filename,
					request,
				),
			).toEqual(latest);
			expect(calls).toEqual(["latest", "tags/v1.2.3"]);
		},
	);
	test("falls back to historical CLI tags", async () => {
		const calls: string[] = [];
		const result = await resolveVersionedReleaseDownload(
			"cli",
			"1.2.3",
			name,
			(path) => {
				calls.push(path);
				return Promise.resolve(
					path === "tags/v1.2.3"
						? new Response(null, { status: 404 })
						: Response.json({ ...release, tag_name: "cli@1.2.3" }),
				);
			},
		);
		expect(calls).toEqual(["tags/v1.2.3", "tags/cli%401.2.3"]);
		expect(result.url).toContain("cli%401.2.3");
	});
	test("rejects missing, ambiguous, unpublished, mismatched and invalid archives", async () => {
		for (const data of [
			{ ...release, assets: [] },
			{ ...release, assets: [...release.assets, ...release.assets] },
			{ ...release, assets: [{ name, size: 1024, state: "new" }] },
			{ ...release, tag_name: "v1.2.4" },
			{ ...release, tag_name: "desktop@1.2.3" },
			{ ...release, draft: true },
			{ ...release, prerelease: true },
		]) {
			await expect(
				resolveVersionedReleaseDownload("cli", "1.2.3", name, () =>
					Promise.resolve(Response.json(data)),
				),
			).rejects.toBeInstanceOf(ReleaseDownloadError);
		}
		await expect(
			resolveVersionedReleaseDownload("cli", "1.2.3", "wrong.zip", () =>
				Promise.resolve(Response.json(release)),
			),
		).rejects.toMatchObject({ kind: "not_found" });
		await expect(
			resolveVersionedReleaseDownload("cli", "../latest", name, () => {
				throw new Error("must not fetch");
			}),
		).rejects.toMatchObject({ kind: "not_found" });
		await expect(
			resolveReleaseDownload("cli", () =>
				Promise.resolve(new Response(null, { status: 404 })),
			),
		).rejects.toMatchObject({ kind: "not_found" });
		await expect(
			resolveReleaseDownload("cli", () => Promise.reject(new Error("offline"))),
		).rejects.toMatchObject({ kind: "storage" });
	});
});
