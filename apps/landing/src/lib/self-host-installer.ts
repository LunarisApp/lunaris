const releaseApi = "https://api.github.com/repos/LunarisApp/lunaris/releases";
const versionPattern = /^\d+\.\d+\.\d+$/;

export function installerUrl(version: string, unified = false) {
	if (!versionPattern.test(version))
		throw new Error("Invalid self-hosted version");
	return `https://github.com/LunarisApp/lunaris/releases/download/${unified ? `v${version}` : `self-hosted%40${version}`}/install.sh`;
}

async function readReleases(page: number): Promise<unknown> {
	const response = await fetch(`${releaseApi}?per_page=100&page=${page}`, {
		headers: { Accept: "application/vnd.github+json" },
		next: { revalidate: 300 },
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok)
		throw new Error(`GitHub releases returned ${response.status}`);
	return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNewerVersion(version: string, previous: string) {
	const previousParts = previous.split(".").map(BigInt);
	for (const [index, part] of version.split(".").map(BigInt).entries()) {
		if (part !== previousParts[index]) return part > previousParts[index];
	}
	return false;
}

export async function latestInstallerUrl(
	readPage: (page: number) => Promise<unknown> = readReleases,
) {
	// Release creation order is not version order (for example, an older-line
	// patch may be published later). Compare eligible versions across pages.
	let latest: string | undefined;
	let unified = false;
	for (let page = 1; page <= 10; page++) {
		const releases = await readPage(page);
		if (!Array.isArray(releases))
			throw new Error("Invalid GitHub release list");
		for (const release of releases) {
			if (
				!isRecord(release) ||
				release.draft !== false ||
				release.prerelease !== false ||
				typeof release.tag_name !== "string" ||
				!(
					release.tag_name.startsWith("self-hosted@") ||
					/^v\d+\.\d+\.\d+$/.test(release.tag_name)
				) ||
				!Array.isArray(release.assets) ||
				!release.assets.some(
					(asset: unknown) => isRecord(asset) && asset.name === "install.sh",
				)
			)
				continue;
			const version = release.tag_name.startsWith("v")
				? release.tag_name.slice(1)
				: release.tag_name.slice("self-hosted@".length);
			if (
				versionPattern.test(version) &&
				(!latest || isNewerVersion(version, latest))
			) {
				latest = version;
				unified = release.tag_name.startsWith("v");
			}
		}
		if (releases.length < 100) break;
	}
	if (latest) return installerUrl(latest, unified);
	throw new Error("No published self-hosted installer found");
}

export async function versionedInstallerUrl(
	version: string,
	readRelease: (url: string) => Promise<Response> = (url) =>
		fetch(url, {
			headers: { Accept: "application/vnd.github+json" },
			next: { revalidate: 300 },
			signal: AbortSignal.timeout(10_000),
		}),
) {
	if (!versionPattern.test(version))
		throw new Error("Invalid self-hosted version");
	const response = await readRelease(`${releaseApi}/tags/v${version}`);
	if (response.status === 404) return installerUrl(version);
	if (!response.ok)
		throw new Error(`GitHub release returned ${response.status}`);
	const release: unknown = await response.json();
	if (
		!isRecord(release) ||
		release.draft !== false ||
		release.prerelease !== false ||
		!Array.isArray(release.assets) ||
		!release.assets.some(
			(asset: unknown) => isRecord(asset) && asset.name === "install.sh",
		)
	)
		throw new Error("Published product installer unavailable");
	return installerUrl(version, true);
}
