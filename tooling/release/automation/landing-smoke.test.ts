import { expect, test } from "bun:test";
import { smokeLanding } from "./landing-smoke";

function request(handler: (url: string, options?: RequestInit) => Response) {
  return (url: string, options?: RequestInit) =>
    Promise.resolve(handler(url, options));
}

test("landing verification checks pages, installer redirect and asset", async () => {
  const asset =
    "https://github.com/LunarisApp/lunaris/releases/download/self-hosted%400.1.0/install.sh";
  const calls: string[] = [];
  const good = (url: string, options?: RequestInit) => {
    calls.push(url);
    if (url.endsWith("/install.sh") && url.startsWith("https://fixture")) {
      expect(options?.redirect).toBe("manual");
      return new Response(null, { status: 307, headers: { location: asset } });
    }
    return new Response("content");
  };
  await smokeLanding("https://fixture/health", request(good));
  expect(calls).toContain("https://fixture/en/self-hosted");
  expect(calls).toContain(asset);
  for (const failUrl of [
    "https://fixture/",
    "https://fixture/en/self-hosted",
    "https://fixture/install.sh",
    asset,
  ]) {
    await expect(
      smokeLanding(
        "https://fixture/health",
        request((url, options) =>
          url === failUrl
            ? new Response(null, { status: 404 })
            : good(url, options)
        )
      )
    ).rejects.toThrow();
  }
  await expect(
    smokeLanding(
      "https://fixture/health",
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
