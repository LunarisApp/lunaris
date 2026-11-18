import { injectHttp } from "../test/inject-http";
import { afterEach, describe, expect, it } from "bun:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  NodeAdapter,
  type NestNodeApplication,
  type NodeResponse,
} from "@nestjs/platform-node";
import {
  CONTENT_SECURITY_POLICY_PARTS,
  getSecurityHeadersConfig,
  PERMISSIONS_POLICY,
  registerPermissionsPolicyHeader,
  STRICT_TRANSPORT_SECURITY,
} from "./helmet.config";

@Module({})
class TestModule {}
const apps: NestNodeApplication[] = [];

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    await app?.close();
  }
});

describe("helmet security headers", () => {
  it("sets headers on missing routes", async () => {
    const app = await createApp({ isProduction: true });

    const response = await injectHttp(app, {
      method: "GET",
      url: "/missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["permissions-policy"]).toBe(PERMISSIONS_POLICY);
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["strict-transport-security"]).toBe(
      STRICT_TRANSPORT_SECURITY
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["cross-origin-resource-policy"]).toBe("same-site");
    assertCsp(response.headers["content-security-policy"]);
  });

  it("keeps swagger-compatible html responses working", async () => {
    const app = await createApp({ isProduction: true });

    const response = await injectHttp(app, {
      method: "GET",
      url: "/api",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["permissions-policy"]).toBe(PERMISSIONS_POLICY);
    expect(response.headers["cross-origin-resource-policy"]).toBe("same-site");
    assertCsp(response.headers["content-security-policy"]);
  });

  it("skips hsts outside production", async () => {
    const app = await createApp({ isProduction: false });

    const response = await injectHttp(app, {
      method: "GET",
      url: "/missing",
    });

    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });
});

async function createApp(options: { isProduction: boolean }) {
  const nest = await NestFactory.create<NestNodeApplication>(
    TestModule,
    new NodeAdapter(),
    { logger: false }
  );
  registerPermissionsPolicyHeader(nest);
  nest.useSecurityHeaders(getSecurityHeadersConfig(options.isProduction));
  nest
    .getHttpAdapter()
    .get("/api", (_request: unknown, reply: NodeResponse) =>
      reply.type("text/html").send("<html></html>")
    );
  await nest.init();
  apps.push(nest);
  return nest;
}

function assertCsp(csp: string | string[] | undefined) {
  expect(typeof csp).toBe("string");

  for (const part of CONTENT_SECURITY_POLICY_PARTS) {
    expect(csp).toContain(part);
  }
}
