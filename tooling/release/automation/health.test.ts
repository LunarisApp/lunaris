import { expect, test } from "bun:test";
import { verifyHostedHealth } from "./health";

const sha = "a".repeat(40);
const headers = { "X-Lunaris-Commit": sha, "X-Lunaris-Version": "1.0.0" };
function request(handler: (url: string, options?: RequestInit) => Response) {
  return ((url, options) => Promise.resolve(handler(String(url), options))) as (
    url: string,
    options?: RequestInit
  ) => Promise<Response>;
}

test("hosted verification requires healthy expected SHA and version", async () => {
  await verifyHostedHealth(
    "https://fixture/health",
    sha,
    "1.0.0",
    false,
    request(() => new Response("ok", { headers }))
  );
  for (const response of [
    new Response(null, { status: 503 }),
    new Response("ok"),
    new Response("ok", {
      headers: { ...headers, "X-Lunaris-Commit": "b".repeat(40) },
    }),
    new Response("ok", {
      headers: { ...headers, "X-Lunaris-Version": "0.9.0" },
    }),
  ]) {
    await expect(
      verifyHostedHealth(
        "https://fixture/health",
        sha,
        "1.0.0",
        false,
        request(() => response)
      )
    ).rejects.toThrow();
  }
});

test("landing verification checks pages, installer redirect and asset", async () => {
  const asset =
    "https://github.com/LunarisApp/lunaris/releases/download/self-hosted%400.1.0/install.sh";
  const calls: string[] = [];
  const good = (url: string, options?: RequestInit) => {
    calls.push(url);
    if (url.endsWith("/health")) {
      return new Response("ok", { headers });
    }
    if (url.endsWith("/install.sh") && url.startsWith("https://fixture")) {
      expect(options?.redirect).toBe("manual");
      return new Response(null, { status: 307, headers: { location: asset } });
    }
    return new Response("content");
  };
  await verifyHostedHealth(
    "https://fixture/health",
    sha,
    "1.0.0",
    true,
    request(good)
  );
  expect(calls).toContain("https://fixture/en/self-hosted");
  expect(calls).toContain(asset);
  for (const failUrl of [
    "https://fixture/",
    "https://fixture/en/self-hosted",
    "https://fixture/install.sh",
    asset,
  ]) {
    await expect(
      verifyHostedHealth(
        "https://fixture/health",
        sha,
        "1.0.0",
        true,
        request((url, options) =>
          url === failUrl
            ? new Response(null, { status: 404 })
            : good(url, options)
        )
      )
    ).rejects.toThrow();
  }
  await expect(
    verifyHostedHealth(
      "https://fixture/health",
      sha,
      "1.0.0",
      true,
      request((url, options) =>
        url === "https://fixture/install.sh"
          ? new Response(null, {
              status: 307,
              headers: { location: "https://evil.example/install.sh" },
            })
          : good(url, options)
      )
    )
  ).rejects.toThrow("Installer smoke check failed");
});
