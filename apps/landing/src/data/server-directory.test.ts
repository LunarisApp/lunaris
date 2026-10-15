import { describe, expect, test } from "bun:test";
import { GET, HEAD } from "../app/.well-known/lunaris-servers/route";

const url = "https://lunaris.app/.well-known/lunaris-servers";

describe("server directory", () => {
  test("serves the public server contract with available and planned servers", async () => {
    const response = GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      servers: [
        { serverId: "us", displayName: "United States", status: "available",
          manifestUrl: "https://api-us.lunaris.app/v1/manifest" },
        { serverId: "eu", displayName: "European Union", status: "planned" },
      ],
    });
  });

  test("HEAD shares GET headers without a body", async () => {
    const response = HEAD(new Request(url, { method: "HEAD" }));
    expect(response.status).toBe(200);
    expect([...response.headers]).toEqual([...GET(new Request(url)).headers]);
    expect(await response.text()).toBe("");
  });

  test("honors exact, weak and wildcard cache validators", async () => {
    const etag = GET(new Request(url)).headers.get("etag")!;
    for (const validator of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      for (const method of [GET, HEAD]) {
        const response = method(new Request(url, { headers: { "If-None-Match": validator } }));
        expect(response.status).toBe(304);
        expect(response.headers.get("etag")).toBe(etag);
        expect(await response.text()).toBe("");
      }
    }
    expect(GET(new Request(url, { headers: { "If-None-Match": '"stale"' } })).status).toBe(200);
  });
});
