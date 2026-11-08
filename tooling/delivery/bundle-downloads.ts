// Use GitHub's release API when its browser download endpoint is unavailable.
// Tauri still extracts and verifies the downloaded tools itself.
export async function downloadTool(
  path: string,
  token: string,
  request: (url: string, options?: RequestInit) => Promise<Response> = fetch
): Promise<Response> {
  const match =
    /^\/tauri-apps\/(binary-releases|nsis-tauri-utils)\/([^/]+)\/([^/]+)$/.exec(
      path
    );
  if (!(match?.[1] && match[2] && match[3])) {
    return new Response("Unknown bundler tool", { status: 404 });
  }
  const [, repository, tag, name] = match;
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    Accept: "application/vnd.github+json",
  };
  const release = await request(
    `https://api.github.com/repos/tauri-apps/${repository}/releases/tags/${tag}`,
    { headers, signal: AbortSignal.timeout(60_000) }
  );
  if (!release.ok) {
    return new Response("GitHub release lookup failed", {
      status: release.status,
    });
  }
  const metadata = (await release.json()) as {
    assets: { name: string; id: number }[];
  };
  const asset = metadata.assets.find(
    (entry) => entry.name === decodeURIComponent(name)
  );
  if (!asset) {
    return new Response("GitHub release asset missing", { status: 404 });
  }
  const result = await request(
    `https://api.github.com/repos/tauri-apps/${repository}/releases/assets/${asset.id}`,
    {
      headers: { ...headers, Accept: "application/octet-stream" },
      signal: AbortSignal.timeout(120_000),
    }
  );
  // Never pass API metadata off as an executable download.
  if (result.headers.get("content-type")?.includes("json")) {
    return new Response("GitHub returned asset metadata", { status: 502 });
  }
  return new Response(result.body, { status: result.status });
}

if (import.meta.main) {
  const { BUNDLER_GITHUB_TOKEN: token, ...environment } = process.env;
  const command = process.argv.slice(2);
  if (!(token && command.length)) {
    throw new Error(
      "Bundler downloads require a GitHub token and build command"
    );
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 255,
    fetch: (request) => downloadTool(new URL(request.url).pathname, token),
  });
  try {
    const build = Bun.spawn(command, {
      env: {
        ...environment,
        TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE: `http://127.0.0.1:${server.port}/<owner>/<repo>/<version>/<asset>`,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await build.exited;
  } finally {
    await server.stop(true);
  }
}
