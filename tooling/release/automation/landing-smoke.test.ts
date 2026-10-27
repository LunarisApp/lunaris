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

test("landing can deploy before first published installer", async () => {
  await smokeLanding(
    "https://fixture/health",
    request((url) => {
      if (url.includes("api.github.com")) {
        return Response.json([
          { tag_name: "web@1.0.0", draft: false, prerelease: false },
          { tag_name: "self-hosted@1.0.0", draft: true, prerelease: false },
        ]);
      }
      return new Response(null, {
        status: url.endsWith("/install.sh") ? 503 : 200,
      });
    })
  );
});

test("installer 503 still fails when installer exists on later release page", async () => {
  await expect(
    smokeLanding(
      "https://fixture/health",
      request((url) => {
        if (url.includes("api.github.com")) {
          return Response.json(
            url.endsWith("page=1")
              ? Array.from({ length: 100 }, () => ({ tag_name: "web@1.0.0" }))
              : [
                  {
                    tag_name: "self-hosted@1.0.0",
                    draft: false,
                    prerelease: false,
                    assets: [{ name: "install.sh" }],
                  },
                ]
          );
        }
        return new Response(null, {
          status: url.endsWith("/install.sh") ? 503 : 200,
        });
      })
    )
  ).rejects.toThrow("Installer smoke check failed: 503");
});

test("missing release evidence cannot excuse installer outage", async () => {
  for (const evidence of [
    new Response(null, { status: 403 }),
    Response.json({ message: "invalid" }),
    Response.json(Array.from({ length: 100 }, () => ({}))),
  ]) {
    await expect(
      smokeLanding(
        "https://fixture/health",
        request((url) => {
          if (url.includes("api.github.com")) {
            return evidence.clone();
          }
          return new Response(null, {
            status: url.endsWith("/install.sh") ? 503 : 200,
          });
        })
      )
    ).rejects.toThrow();
  }
});
