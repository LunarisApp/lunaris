import { afterEach, describe, expect, it } from "bun:test";
import Fastify, { type FastifyInstance } from "fastify";
import {
  DESKTOP_COOKIE_HEADER,
  DESKTOP_ORIGIN_HEADER,
  isAllowedDesktopCookieOrigin,
  registerDesktopCookieBridge,
} from "./desktop-auth.config";

const apps: FastifyInstance[] = [];
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
      isAllowedDesktopCookieOrigin("tauri://localhost", productionConfig),
    ).toBe(true);
    expect(
      isAllowedDesktopCookieOrigin("https://web.lunaris.app", productionConfig),
    ).toBe(false);
    expect(
      isAllowedDesktopCookieOrigin("http://localhost:1420", {
        ...productionConfig,
        nodeEnv: "development",
      }),
    ).toBe(true);
  });

  it("authenticates GET requests with bridged desktop cookies", async () => {
    const app = await createApp();
    const response = await app.inject({
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
    const response = await app.inject({
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
    const response = await app.inject({
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
    const response = await app.inject({
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
  const app = Fastify();
  registerDesktopCookieBridge(app, productionConfig);
  app.get("/cookies", (request) => ({
    ...(request.headers.cookie?.match(
      /(?:^|;\s*)lunaris\.session_token=([^;]+)/,
    )?.[1]
      ? {
          session: request.headers.cookie?.match(
            /(?:^|;\s*)lunaris\.session_token=([^;]+)/,
          )?.[1],
        }
      : {}),
  }));
  app.get("/authenticated", (request, reply) => {
    if (
      request.headers.cookie?.match(
        /(?:^|;\s*)lunaris\.session_token=([^;]+)/,
      )?.[1] !== "desktop-session"
    ) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return { userId: "desktop-user" };
  });
  app.get("/request", (request) => ({
    origin: request.headers.origin,
    ...(request.headers.cookie?.match(
      /(?:^|;\s*)lunaris\.session_token=([^;]+)/,
    )?.[1]
      ? {
          session: request.headers.cookie?.match(
            /(?:^|;\s*)lunaris\.session_token=([^;]+)/,
          )?.[1],
        }
      : {}),
  }));
  await app.ready();
  apps.push(app);
  return app;
}
