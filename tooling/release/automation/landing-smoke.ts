export async function smokeLanding(
  healthUrl: string,
  request: (url: string, options?: RequestInit) => Promise<Response> = fetch
) {
  const get = (url: string, redirect: RequestRedirect = "follow") =>
    request(url, {
      redirect,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  for (const path of ["/", "/en/self-hosted"]) {
    const url = new URL(path, healthUrl).href;
    const response = await get(url);
    if (response.status !== 200) {
      throw new Error(`Landing smoke check failed: ${url}: ${response.status}`);
    }
  }
  const installer = await get(new URL("/install.sh", healthUrl).href, "manual");
  // Before the first self-hosted release, the installer intentionally returns 503.
  // Check public release evidence so outages after publication still fail CI.
  if (installer.status === 503 && !(await hasPublishedInstaller(get))) {
    return;
  }
  const location = installer.headers.get("location") ?? "";
  if (
    installer.status !== 307 ||
    !/^https:\/\/github\.com\/LunarisApp\/lunaris\/releases\/download\/self-hosted(?:%40|@)\d+\.\d+\.\d+\/install\.sh$/.test(
      location
    )
  ) {
    throw new Error(
      `Installer smoke check failed: ${installer.status}; ${location}`
    );
  }
  const asset = await get(location);
  if (!asset.ok) {
    throw new Error(`Installer asset unavailable: ${asset.status}`);
  }
}

async function hasPublishedInstaller(get: (url: string) => Promise<Response>) {
  for (let page = 1; page <= 10; page++) {
    const response = await get(
      `https://api.github.com/repos/LunarisApp/lunaris/releases?per_page=100&page=${page}`
    );
    if (!response.ok) {
      throw new Error(`Installer release check failed: ${response.status}`);
    }
    const releases: unknown = await response.json();
    if (!Array.isArray(releases)) {
      throw new Error("Invalid installer release list");
    }
    if (
      releases.some(
        (release) =>
          release?.draft === false &&
          release.prerelease === false &&
          typeof release.tag_name === "string" &&
          /^self-hosted@\d+\.\d+\.\d+$/.test(release.tag_name) &&
          Array.isArray(release.assets) &&
          release.assets.some(
            (asset: { name?: string } | null) => asset?.name === "install.sh"
          )
      )
    ) {
      return true;
    }
    if (releases.length < 100) {
      return false;
    }
  }
  throw new Error("Installer release check exceeded pagination limit");
}
