const releaseApi = "https://api.github.com/repos/LunarisApp/lunaris/releases";
const versionPattern = /^\d+\.\d+\.\d+$/;

export function installerUrl(version: string) {
	if (!versionPattern.test(version))
		throw new Error("Invalid self-hosted version");
	return `https://github.com/LunarisApp/lunaris/releases/download/self-hosted%40${version}/install.sh`;
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

export async function latestInstallerUrl(
	readPage: (page: number) => Promise<unknown> = readReleases,
) {
	// Other components publish to this repository too. Follow pagination instead
	// of using GitHub's repository-wide /latest release.
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
				!release.tag_name.startsWith("self-hosted@") ||
				!Array.isArray(release.assets) ||
				!release.assets.some(
					(asset: unknown) => isRecord(asset) && asset.name === "install.sh",
				)
			)
				continue;
			const version = release.tag_name.slice("self-hosted@".length);
			if (versionPattern.test(version)) return installerUrl(version);
		}
		if (releases.length < 100) break;
	}
	throw new Error("No published self-hosted installer found");
}
