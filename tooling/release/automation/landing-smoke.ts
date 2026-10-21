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
