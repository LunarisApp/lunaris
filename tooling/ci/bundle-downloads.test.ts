import { expect, test } from "bun:test";
import { downloadTool } from "../delivery/bundle-downloads";

test("bundler tools resolve exact release assets through the official API", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const request = ((url: string, options?: RequestInit) => {
    calls.push([url, options]);
    return Promise.resolve(
      calls.length === 1
        ? Response.json({ assets: [{ name: "nsis-3.13.zip", id: 123 }] })
        : new Response(new Uint8Array([80, 75, 3, 4]))
    );
  }) as Parameters<typeof downloadTool>[2];
  const response = await downloadTool(
    "/tauri-apps/binary-releases/nsis-3.13/nsis-3.13.zip",
    "test-token",
    request
  );
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
    80, 75, 3, 4,
  ]);
  expect(calls.map(([url]) => url)).toEqual([
    "https://api.github.com/repos/tauri-apps/binary-releases/releases/tags/nsis-3.13",
    "https://api.github.com/repos/tauri-apps/binary-releases/releases/assets/123",
  ]);
  expect(calls[1]?.[1]?.headers).toMatchObject({
    Accept: "application/octet-stream",
    Authorization: "Bearer test-token",
  });
});

test("bundler downloads reject unknown routes, missing assets, and API errors", async () => {
  const path = "/tauri-apps/binary-releases/apprun-old/AppRun-x86_64";
  for (const [upstream, expected] of [
    [new Response("unavailable", { status: 503 }), 503],
    [Response.json({ assets: [] }), 404],
  ] as const) {
    const request = (() => Promise.resolve(upstream)) as Parameters<
      typeof downloadTool
    >[2];
    expect((await downloadTool(path, "token", request)).status).toBe(expected);
  }
  expect(
    (await downloadTool("/other/repository/tag/asset", "token")).status
  ).toBe(404);
  let calls = 0;
  const request = (() => {
    calls += 1;
    return Promise.resolve(
      Response.json(
        calls === 1 ? { assets: [{ name: "AppRun-x86_64", id: 1 }] } : {}
      )
    );
  }) as Parameters<typeof downloadTool>[2];
  expect((await downloadTool(path, "token", request)).status).toBe(502);
});

test("download wrapper preserves build failure and keeps API token out of child", async () => {
  const build = Bun.spawn(
    [
      process.execPath,
      "tooling/delivery/bundle-downloads.ts",
      process.execPath,
      "-e",
      `if (process.env.BUNDLER_GITHUB_TOKEN) process.exit(9);
       if (!process.env.TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE?.startsWith("http://127.0.0.1:")) process.exit(10);
       process.exit(7);`,
    ],
    {
      env: { ...process.env, BUNDLER_GITHUB_TOKEN: "test-token" },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  expect(await build.exited).toBe(7);
});
