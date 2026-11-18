import { injectHttp } from "../test/inject-http";
import { afterEach, describe, expect, it } from "bun:test";
import {
  NodeAdapter,
  type NestNodeApplication,
  type NodeRequest,
  type NodeResponse,
} from "@nestjs/platform-node";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import {
  DESKTOP_COOKIE_HEADER,
  DESKTOP_ORIGIN_HEADER,
  isAllowedDesktopCookieOrigin,
  registerDesktopCookieBridge,
} from "./desktop-auth.config";

@Module({})
class TestModule {}

const apps: NestNodeApplication[] = [];
const productionConfig = {
  desktopAppOrigins: [
    "lunaris://",
    "tauri://localhost",
    "http://tauri.localhost",
  ],
  nodeEnv: "production",
};

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close();
  }
});

describe("desktop auth cookie bridge", () => {
  it("allows configured origins and local development only", () => {
    expect(
      isAllowedDesktopCookieOrigin("tauri://localhost", productionConfig)
    ).toBe(true);
    expect(
      isAllowedDesktopCookieOrigin("tauri://localhost ", productionConfig)
    ).toBe(false);
    expect(
      isAllowedDesktopCookieOrigin("https://web.lunaris.app", productionConfig)
    ).toBe(false);
    expect(
      isAllowedDesktopCookieOrigin("http://localhost:1420", {
        ...productionConfig,
        nodeEnv: "development",
      })
    ).toBe(true);
  });

  it("authenticates GET requests with bridged desktop cookies", async () => {
    const app = await createApp();
    const response = await injectHttp(app, {
      headers: {
        [DESKTOP_COOKIE_HEADER]: "lunaris.session_token=desktop-session",
        origin: "tauri://localhost",
      },
      method: "GET",
      url: "/authenticated",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Record<string, string>>()).toEqual({
      userId: "desktop-user",
    });
  });

  it("normalizes an approved Tauri origin header", async () => {
    const app = await createApp();
    const response = await injectHttp(app, {
      headers: {
        [DESKTOP_COOKIE_HEADER]: "lunaris.session_token=desktop-session",
        [DESKTOP_ORIGIN_HEADER]: "lunaris://",
      },
      method: "GET",
      url: "/request",
    });

    expect(response.json<Record<string, string>>()).toEqual({
      origin: "lunaris://",
      session: "desktop-session",
    });
  });

  it("rejects conflicting browser and Tauri origins", async () => {
    const app = await createApp();
    const response = await injectHttp(app, {
      headers: {
        [DESKTOP_COOKIE_HEADER]: "lunaris.session_token=desktop-session",
        [DESKTOP_ORIGIN_HEADER]: "lunaris://",
        origin: "https://evil.example",
      },
      method: "GET",
      url: "/request",
    });

    expect(response.json<Record<string, string>>()).toEqual({
      origin: "https://evil.example",
    });
  });

  it("ignores smuggled cookies from untrusted origins", async () => {
    const app = await createApp();
    const response = await injectHttp(app, {
      headers: {
        [DESKTOP_COOKIE_HEADER]: "lunaris.session_token=stolen-session",
        origin: "https://evil.example",
      },
      method: "GET",
      url: "/cookies",
    });

    expect(response.json<Record<string, string>>()).toEqual({});
  });
});

async function createApp() {
  const app = await NestFactory.create<NestNodeApplication>(
    TestModule,
    new NodeAdapter(),
    { logger: false }
  );
  const router = app.getHttpAdapter().getInstance();
  registerDesktopCookieBridge(app, productionConfig);
  router.get("/cookies", (request: NodeRequest, reply: NodeResponse) =>
    reply.send({
      ...(request.headers.cookie?.match(
        /(?:^|;\s*)lunaris\.session_token=([^;]+)/
      )?.[1]
        ? {
            session: request.headers.cookie?.match(
              /(?:^|;\s*)lunaris\.session_token=([^;]+)/
            )?.[1],
          }
        : {}),
    })
  );
  router.get("/authenticated", (request: NodeRequest, reply: NodeResponse) => {
    if (
      request.headers.cookie?.match(
        /(?:^|;\s*)lunaris\.session_token=([^;]+)/
      )?.[1] !== "desktop-session"
    ) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return reply.send({ userId: "desktop-user" });
  });
  router.get("/request", (request: NodeRequest, reply: NodeResponse) =>
    reply.send({
      origin: request.headers.origin,
      ...(request.headers.cookie?.match(
        /(?:^|;\s*)lunaris\.session_token=([^;]+)/
      )?.[1]
        ? {
            session: request.headers.cookie?.match(
              /(?:^|;\s*)lunaris\.session_token=([^;]+)/
            )?.[1],
          }
        : {}),
    })
  );
  await app.init();
  apps.push(app);
  return app;
}
