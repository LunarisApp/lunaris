import { afterEach, describe, expect, it } from "bun:test";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  CORS_METHODS,
  getCorsConfig,
  isAllowedOrigin,
  normalizeOrigin,
} from "./cors.config";

const apps: NestFastifyApplication[] = [];
const productionConfig = {
  desktopAppOrigins: [
    "lunaris://",
    "tauri://localhost",
    "http://tauri.localhost",
  ],
  frontendUrl: "https://web.lunaris.app",
  nodeEnv: "production",
};

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    await app?.close();
  }
});

describe("CORS config", () => {
  it("allows DELETE preflight from the configured production frontend", async () => {
    const app = await createApp(productionConfig);

    const response = await app.inject({
      headers: {
        "access-control-request-headers": "x-csrf-token",
        "access-control-request-method": "DELETE",
        origin: "https://web.lunaris.app",
      },
      method: "OPTIONS",
      url: "/v1/files/test-id",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://web.lunaris.app"
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain(
      "DELETE"
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "x-csrf-token"
    );
  });

  it("does not allow unknown production origins", () => {
    expect(isAllowedOrigin("https://evil.example", productionConfig)).toBe(
      false
    );
  });

  it("normalizes and allows configured desktop origins", () => {
    expect(normalizeOrigin("tauri://localhost/path")).toBe("tauri://localhost");
    expect(normalizeOrigin("lunaris://auth/callback")).toBe("lunaris://auth");
    expect(isAllowedOrigin("tauri://localhost", productionConfig)).toBe(true);
    expect(isAllowedOrigin("http://tauri.localhost", productionConfig)).toBe(
      true
    );
  });

  it("allows desktop transport headers in production preflight", async () => {
    const app = await createApp(productionConfig);
    const response = await app.inject({
      headers: {
        "access-control-request-headers": "tauri-origin,x-tauri-cookie",
        "access-control-request-method": "POST",
        origin: "tauri://localhost",
      },
      method: "OPTIONS",
      url: "/v1/auth/sign-in/email",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "tauri://localhost"
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "x-tauri-cookie"
    );
  });

  it("allows local development origins outside production", () => {
    expect(
      isAllowedOrigin("http://localhost:5173", {
        desktopAppOrigins: productionConfig.desktopAppOrigins,
        frontendUrl: "https://web.lunaris.app",
        nodeEnv: "development",
      })
    ).toBe(true);
  });

  it("keeps the explicit method list in sync with unsafe API methods", () => {
    expect(CORS_METHODS).toEqual([
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]);
  });
});

async function createApp(appConfig: typeof productionConfig) {
  const moduleRef = await Test.createTestingModule({}).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter()
  );
  app.enableCors(getCorsConfig(appConfig));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
}
