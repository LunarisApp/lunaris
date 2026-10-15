import { describe, expect, it } from "bun:test";
import { PATH_METADATA } from "@nestjs/common/constants";
import {
  isMcpOriginAllowed,
  McpController,
  toWebRequest,
} from "./mcp.controller";

describe("McpController authorization-server discovery", () => {
  it("registers both discovery route aliases", () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        McpController.prototype.authorizationServer,
      ),
    ).toEqual([
      ".well-known/oauth-authorization-server",
      ".well-known/oauth-authorization-server/auth",
    ]);
  });
});

describe("isMcpOriginAllowed", () => {
  const backendUrl = "https://api.lunaris.app";
  const frontendUrl = "https://app.lunaris.app";

  it("allows non-browser and configured application origins", () => {
    expect(isMcpOriginAllowed(undefined, backendUrl, frontendUrl)).toBe(true);
    expect(
      isMcpOriginAllowed("https://api.lunaris.app", backendUrl, frontendUrl),
    ).toBe(true);
    expect(
      isMcpOriginAllowed("https://app.lunaris.app", backendUrl, frontendUrl),
    ).toBe(true);
  });

  it("rejects foreign and malformed origins", () => {
    expect(
      isMcpOriginAllowed("https://attacker.example", backendUrl, frontendUrl),
    ).toBe(false);
    expect(isMcpOriginAllowed("null", backendUrl, frontendUrl)).toBe(false);
  });

  it("forwards Fastify's parsed MCP request body", async () => {
    const request = {
      body: { id: 1, jsonrpc: "2.0", method: "initialize" },
      headers: {
        "content-length": "999",
        "content-type": "application/json",
      },
      method: "POST",
      raw: { toArray: () => Promise.resolve([]) },
      url: "/mcp",
    } as never;

    const webRequest = await toWebRequest(
      request,
      "https://api.lunaris.app",
    );

    expect(await webRequest.json()).toEqual({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
    });
    expect(webRequest.headers.has("content-length")).toBe(false);
  });
});
