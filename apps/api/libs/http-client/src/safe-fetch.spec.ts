import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { isPublicIpAddress, parseSafeUrl, safeFetch } from "./safe-fetch";

describe("safe fetch URL validation", () => {
  it("accepts public HTTP URLs when enabled", () => {
    const url = parseSafeUrl("http://example.com/docs#private", {
      allowedProtocols: ["http:", "https:"],
    });

    expect(url.toString()).toBe("http://example.com/docs");
  });

  it("rejects private addresses by default", () => {
    expect(() => parseSafeUrl("https://127.0.0.1/admin")).toThrow();
    expect(() => parseSafeUrl("https://localhost/admin")).toThrow();
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("::ffff:127.0.0.1")).toBe(false);
  });

  it("requires explicit private-network access", () => {
    expect(
      parseSafeUrl("http://localhost/manifest", {
        allowedProtocols: ["http:", "https:"],
        allowPrivateNetwork: true,
      }).hostname
    ).toBe("localhost");
  });
});

describe("safe fetch transport", () => {
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    server = Bun.serve({
      fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/redirect") {
          return Response.redirect(
            `http://127.0.0.1:${server.port}/content`,
            302
          );
        }
        if (pathname === "/large") {
          return new Response("response exceeds limit");
        }
        return new Response("ready", {
          headers: { "Content-Type": "text/plain" },
        });
      },
      hostname: "127.0.0.1",
      port: 0,
    });
  });

  afterAll(() => server.stop(true));

  it("follows redirects under the same URL policy", async () => {
    const response = await safeFetch(
      `http://127.0.0.1:${server.port}/redirect`,
      {
        allowedProtocols: ["http:"],
        allowNonStandardPorts: true,
        allowPrivateNetwork: true,
        maxBytes: 100,
        signal: AbortSignal.timeout(1000),
      }
    );

    expect(response.body.toString()).toBe("ready");
    expect(response.url.pathname).toBe("/content");
  });

  it("enforces response byte limits", async () => {
    await expect(
      safeFetch(`http://127.0.0.1:${server.port}/large`, {
        allowedProtocols: ["http:"],
        allowNonStandardPorts: true,
        allowPrivateNetwork: true,
        maxBytes: 5,
        signal: AbortSignal.timeout(1000),
      })
    ).rejects.toThrow("URL response is too large");
  });
});
