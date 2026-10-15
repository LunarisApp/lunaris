import { describe, expect, test } from "bun:test";
import {
	parseReleaseManifest,
	ReleaseDownloadError,
	type ReleaseTarget,
	readReleaseStorageConfig,
	resolveReleaseDownload,
	resolveVersionedReleaseDownload,
} from "./release-downloads";

const environment = {
	RELEASES_S3_ACCESS_KEY_ID: "release-reader",
	RELEASES_S3_SECRET_ACCESS_KEY: "secret",
	RELEASES_S3_REGION: "auto",
	RELEASES_S3_BUCKET: "lunaris-releases",
	RELEASES_S3_ENDPOINT: "https://storage.example.test",
};

function manifestFor(
	target: ReleaseTarget,
	options: { signingMode?: "adhoc" | "signed"; version?: string } = {},
) {
	const component = target === "macos" ? "desktop" : "cli";
	const version = options.version ?? "1.2.3";
	const signingMode = options.signingMode ?? "signed";
	const suffix = signingMode === "adhoc" ? "-adhoc" : "";
	const name =
		component === "desktop"
			? `Lunaris-desktop-${version}-universal${suffix}.dmg`
			: `lunaris-cli-${version}-universal-apple-darwin${suffix}.zip`;

	return {
		schemaVersion: 1,
		component,
		version,
		tag: `${component}@${version}`,
		sourceCommit: "a".repeat(40),
		signingMode,
		minimumSystemVersion: "13.0",
		artifacts: [
			{
				name,
				objectKey: `releases/${component}/${version}/${name}`,
				target: "universal-apple-darwin",
				format: component === "desktop" ? "dmg" : "zip",
				size: 1024,
				sha256: "b".repeat(64),
			},
		],
	};
}

describe("resolveReleaseDownload", () => {
	test("resolves the latest macOS DMG with a five-minute signed URL", async () => {
		const calls: Array<{ type: string; value: unknown }> = [];
		const result = await resolveReleaseDownload("macos", environment, {
			getManifest(key) {
				calls.push({ type: "manifest", value: { key } });
				return Promise.resolve(JSON.stringify(manifestFor("macos")));
			},
			signDownload(input) {
				calls.push({ type: "sign", value: input });
				return Promise.resolve("https://storage.example.test/signed-desktop");
			},
		});

		expect(result).toEqual({
			component: "desktop",
			signingMode: "signed",
			url: "https://storage.example.test/signed-desktop",
			version: "1.2.3",
		});
		expect(calls).toEqual([
			{
				type: "manifest",
				value: {
					key: "releases/desktop/latest.json",
				},
			},
			{
				type: "sign",
				value: {
					expiresIn: 300,
					key: "releases/desktop/1.2.3/Lunaris-desktop-1.2.3-universal.dmg",
					name: "Lunaris-desktop-1.2.3-universal.dmg",
				},
			},
		]);
	});

	test("allows the latest ad-hoc CLI archive", async () => {
		const result = await resolveReleaseDownload("cli", environment, {
			getManifest: () =>
				Promise.resolve(
					JSON.stringify(
						manifestFor("cli", {
							signingMode: "adhoc",
							version: "2.0.0",
						}),
					),
				),
			signDownload: () =>
				Promise.resolve("https://storage.example.test/signed-cli"),
		});

		expect(result).toEqual({
			component: "cli",
			signingMode: "adhoc",
			url: "https://storage.example.test/signed-cli",
			version: "2.0.0",
		});
	});

	test("reports a missing latest manifest as not found", async () => {
		try {
			await resolveReleaseDownload("cli", environment, {
				getManifest: () => Promise.resolve(undefined),
				signDownload: () => Promise.reject(new Error("must not sign")),
			});
			throw new Error("Expected release resolution to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(ReleaseDownloadError);
			expect((error as ReleaseDownloadError).kind).toBe("not_found");
		}
	});

	test("wraps signing failures as storage errors", async () => {
		try {
			await resolveReleaseDownload("macos", environment, {
				getManifest: () =>
					Promise.resolve(JSON.stringify(manifestFor("macos"))),
				signDownload: () => Promise.reject(new Error("provider unavailable")),
			});
			throw new Error("Expected release resolution to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(ReleaseDownloadError);
			expect((error as ReleaseDownloadError).kind).toBe("storage");
		}
	});
});

describe("resolveVersionedReleaseDownload", () => {
	test("loads the immutable manifest and signs the requested artifact", async () => {
		const release = manifestFor("cli", {
			signingMode: "adhoc",
			version: "2.1.0",
		});
		const filename = release.artifacts[0].name;
		const calls: Array<{ type: string; value: unknown }> = [];

		const result = await resolveVersionedReleaseDownload(
			"cli",
			"2.1.0",
			filename,
			environment,
			{
				getManifest(key) {
					calls.push({ type: "manifest", value: key });
					return Promise.resolve(JSON.stringify(release));
				},
				signDownload(input) {
					calls.push({ type: "sign", value: input });
					return Promise.resolve("https://storage.example.test/versioned");
				},
			},
		);

		expect(result).toEqual({
			component: "cli",
			signingMode: "adhoc",
			url: "https://storage.example.test/versioned",
			version: "2.1.0",
		});
		expect(calls).toEqual([
			{
				type: "manifest",
				value: "releases/cli/2.1.0/release.json",
			},
			{
				type: "sign",
				value: {
					expiresIn: 300,
					key: release.artifacts[0].objectKey,
					name: filename,
				},
			},
		]);
	});

	test("rejects a filename that differs from the manifest", async () => {
		const release = manifestFor("macos");

		await expect(
			resolveVersionedReleaseDownload(
				"macos",
				"1.2.3",
				"another.dmg",
				environment,
				{
					getManifest: () => Promise.resolve(JSON.stringify(release)),
					signDownload: () => Promise.reject(new Error("must not sign")),
				},
			),
		).rejects.toMatchObject({ kind: "not_found" });
	});

	test("rejects a manifest for a different version", async () => {
		await expect(
			resolveVersionedReleaseDownload(
				"cli",
				"1.2.3",
				"lunaris-cli-1.2.3-universal-apple-darwin.zip",
				environment,
				{
					getManifest: () =>
						Promise.resolve(
							JSON.stringify(manifestFor("cli", { version: "1.2.4" })),
						),
					signDownload: () => Promise.reject(new Error("must not sign")),
				},
			),
		).rejects.toMatchObject({ kind: "invalid_manifest" });
	});

	test("rejects an invalid version before reading storage configuration", async () => {
		await expect(
			resolveVersionedReleaseDownload(
				"cli",
				"../latest",
				"artifact.zip",
				{},
			),
		).rejects.toMatchObject({ kind: "not_found" });
	});
});

describe("parseReleaseManifest", () => {
	test("rejects a component mismatch", () => {
		expect(() =>
			parseReleaseManifest(JSON.stringify(manifestFor("cli")), "macos"),
		).toThrow("component does not match");
	});

	test("rejects malformed metadata", () => {
		const manifest = manifestFor("macos");
		manifest.artifacts[0].sha256 = "not-a-checksum";
		expect(() =>
			parseReleaseManifest(JSON.stringify(manifest), "macos"),
		).toThrow("artifact metadata is invalid");
	});

	test.each(["1.2.3-.beta", "1.2.3-beta.", "1.2.3-01"])(
		"rejects invalid SemVer version %s",
		(version) => {
			expect(() =>
				parseReleaseManifest(
					JSON.stringify(manifestFor("cli", { version })),
					"cli",
				),
			).toThrow("manifest version is invalid");
		},
	);

	test("rejects an artifact outside the expected release prefix", () => {
		const manifest = manifestFor("cli");
		manifest.artifacts[0].objectKey = "private/admin-credentials";
		expect(() =>
			parseReleaseManifest(JSON.stringify(manifest), "cli"),
		).toThrow("artifact metadata is invalid");
	});
});

describe("release storage configuration", () => {
	test("requires every private storage credential", () => {
		expect(() =>
			readReleaseStorageConfig({
				...environment,
				RELEASES_S3_SECRET_ACCESS_KEY: "",
			}),
		).toThrow("RELEASES_S3_SECRET_ACCESS_KEY");
	});
});
