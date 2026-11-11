export const releaseTargets = ["macos", "windows", "linux", "cli"] as const;
export type ReleaseTarget = (typeof releaseTargets)[number];
type ReleaseComponent = "cli" | "desktop";
type SigningMode = "adhoc" | "signed";

export interface ReleaseDownload {
	component: ReleaseComponent;
	signingMode: SigningMode | "unsigned";
	url: string;
	version: string;
}

export type ReleaseDownloadErrorKind =
	| "configuration"
	| "invalid_manifest"
	| "not_found"
	| "storage";

export class ReleaseDownloadError extends Error {
	readonly kind: ReleaseDownloadErrorKind;

	constructor(
		kind: ReleaseDownloadErrorKind,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "ReleaseDownloadError";
		this.kind = kind;
	}
}

const semverPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export function isReleaseTarget(value: string): value is ReleaseTarget {
	return releaseTargets.some((target) => target === value);
}

export function isReleaseVersion(value: string): boolean {
	return semverPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedAssetName(
	component: ReleaseComponent,
	version: string,
	signingMode: SigningMode,
): string {
	const adhocSuffix = signingMode === "adhoc" ? "-adhoc" : "";
	return component === "cli"
		? `lunaris-cli-${version}-universal-apple-darwin${adhocSuffix}.zip`
		: `Lunaris-desktop-${version}-universal${adhocSuffix}.dmg`;
}

function invalidManifest(message: string): never {
	throw new ReleaseDownloadError("invalid_manifest", message);
}

export async function resolveGithubReleaseDownload(
	version?: string,
	filename?: string,
	request: (path: string) => Promise<Response> = (path) =>
		fetch(`https://api.github.com/repos/LunarisApp/lunaris/releases/${path}`, {
			headers: { Accept: "application/vnd.github+json" },
			next: { revalidate: 300 },
			signal: AbortSignal.timeout(10_000),
		}),
	target: ReleaseTarget = "macos",
): Promise<ReleaseDownload> {
	if (version && !isReleaseVersion(version)) {
		throw new ReleaseDownloadError("not_found", "Release version is invalid");
	}
	const component = target === "cli" ? "cli" : "desktop";
	try {
		let response = await request(
			version ? `tags/v${encodeURIComponent(version)}` : "latest",
		);
		if (version && response.status === 404) {
			response = await request(
				`tags/${encodeURIComponent(`${component}@${version}`)}`,
			);
		}
		if (response.status === 404) {
			throw new ReleaseDownloadError("not_found", "Release was not found");
		}
		if (!response.ok) {
			throw new ReleaseDownloadError(
				"storage",
				"GitHub release could not be read",
			);
		}
		const release: unknown = await response.json();
		if (
			!isRecord(release) ||
			release.draft !== false ||
			release.prerelease !== false ||
			typeof release.tag_name !== "string" ||
			!Array.isArray(release.assets)
		) {
			invalidManifest("GitHub release metadata is invalid");
		}
		const releasedVersion = release.tag_name.startsWith("v")
			? release.tag_name.slice(1)
			: release.tag_name.startsWith(`${component}@`)
				? release.tag_name.slice(component.length + 1)
				: "";
		if (
			!isReleaseVersion(releasedVersion) ||
			(version && version !== releasedVersion)
		) {
			invalidManifest("GitHub release version does not match request");
		}
		const signedName =
			target === "macos" || target === "cli"
				? expectedAssetName(component, releasedVersion, "signed")
				: target === "windows"
					? `Lunaris-desktop-${releasedVersion}-x86_64-pc-windows-msvc.exe`
					: `Lunaris-desktop-${releasedVersion}-x86_64-unknown-linux-gnu.deb`;
		const adhocName =
			target === "macos" || target === "cli"
				? expectedAssetName(component, releasedVersion, "adhoc")
				: undefined;
		const assets = release.assets.filter(
			(asset: unknown): asset is Record<string, unknown> =>
				isRecord(asset) &&
				(asset.name === signedName ||
					(adhocName !== undefined && asset.name === adhocName)) &&
				asset.state === "uploaded" &&
				typeof asset.size === "number" &&
				asset.size > 0,
		);
		if (assets.length === 0) {
			throw new ReleaseDownloadError(
				"not_found",
				"Release artifact was not found",
			);
		}
		if (assets.length !== 1) {
			invalidManifest("GitHub release has ambiguous artifacts");
		}
		const name = assets[0]!.name as string;
		if (filename && filename !== name) {
			throw new ReleaseDownloadError(
				"not_found",
				"Release artifact was not found",
			);
		}
		return {
			component,
			version: releasedVersion,
			signingMode:
				target === "macos" || target === "cli"
					? name === adhocName
						? "adhoc"
						: "signed"
					: "unsigned",
			url: `https://github.com/LunarisApp/lunaris/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`,
		};
	} catch (error) {
		if (error instanceof ReleaseDownloadError) throw error;
		throw new ReleaseDownloadError(
			"storage",
			"GitHub release could not be read",
			{ cause: error },
		);
	}
}

export function resolveReleaseDownload(
	target: ReleaseTarget,
	request?: (path: string) => Promise<Response>,
): Promise<ReleaseDownload> {
	return resolveGithubReleaseDownload(undefined, undefined, request, target);
}

export function resolveVersionedReleaseDownload(
	target: ReleaseTarget,
	version: string,
	filename: string,
	request?: (path: string) => Promise<Response>,
): Promise<ReleaseDownload> {
	if (!isReleaseVersion(version) || !filename) {
		return Promise.reject(
			new ReleaseDownloadError("not_found", "Release artifact was not found"),
		);
	}
	return resolveGithubReleaseDownload(version, filename, request, target);
}
