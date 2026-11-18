import { API_BODY_PARSER_OPTIONS } from "../../libs/auth/src/body-parser.config";
import { injectHttp } from "../inject-http";
import { standardSchemaConverter } from "../../libs/utils/src/openapi-schema";
import { AuditEventsQueryDto } from "@repo/ee-audit/server/schema";
import { SchemaSerializerInterceptor } from "../../libs/utils/src/schema-serializer.interceptor";
// Run with test:runtime, isolated from the unit-test preload mocks.
import "reflect-metadata";
import { afterEach, describe, expect, it } from "bun:test";
import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  Query,
  VersioningType,
} from "@nestjs/common";
import {
  APP_FILTER,
  APP_INTERCEPTOR,
  APP_PIPE,
  NestFactory,
} from "@nestjs/core";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AllowAnonymous, AuthModule } from "@thallesp/nestjs-better-auth";
import { betterAuth } from "better-auth";
import { EvlogModule } from "evlog/nestjs";
import { initLogger, type DrainContext } from "evlog";

const events: DrainContext["event"][] = [];
initLogger({
  pretty: false,
  drain: ({ event }) => {
    events.push(event);
  },
});
import { z } from "zod";
import type { AppConfig } from "../../src/app.config";
import { configureHttpSecurity } from "../../src/security/http-security";
import { OriginExceptionFilter } from "../../src/security/origin-exception.filter";
import { ActionApi, RetrieveApi } from "../../libs/utils/src/openapi";
import { createSchemaValidationPipe } from "../../libs/utils/src/schema-validation";
import { ErrorInterceptor } from "../../libs/utils/src/error.interceptor";
import { PERMISSIONS_POLICY } from "../../src/helmet.config";

const payload = z.object({
  count: z.coerce.number().int().positive().default(1),
});
const result = z.object({ count: z.number() });
const origins = {
  url: "http://api.example",
  frontendUrl: "https://app.example",
  desktopAppOrigins: [
    "lunaris://",
    "tauri://localhost",
    "http://tauri.localhost",
  ],
  nodeEnv: "production",
} as AppConfig;
const apps: NestNodeApplication[] = [];

@AllowAnonymous()
@Controller("native")
class NativeController {
  @ActionApi({
    serializer: result,
    operation: { operationId: "nativeMutation" },
  })
  mutate(@Body({ schema: payload }) body: z.infer<typeof payload>) {
    return { ...body, secret: "strip-me" };
  }

  @RetrieveApi({
    path: "nullable",
    serializer: z.object({ item: result.nullable() }),
  })
  nullable() {
    return { item: null };
  }

  @RetrieveApi({ path: "array", serializer: z.array(result) })
  array() {
    return [{ count: 3, secret: "strip-me" }];
  }

  @RetrieveApi({ path: "invalid", serializer: result })
  invalid() {
    return { count: "private-invalid-value" };
  }

  @RetrieveApi({ path: "invalid-shape", serializer: result })
  invalidShape(@Query("shape") shape: string) {
    return {
      null: null,
      primitive: "private-invalid-value",
      array: [{ count: 1 }],
    }[shape];
  }

  @RetrieveApi({ path: "root-nullable", serializer: result.nullable() })
  rootNullable() {
    return null;
  }

  @Get("dates")
  dates(@Query({ schema: AuditEventsQueryDto }) query: AuditEventsQueryDto) {
    return query;
  }

  @Get("error")
  error() {
    throw new Error("private diagnostic");
  }
}

@Controller("private")
class PrivateController {
  @Post()
  mutate() {
    return { authenticated: true };
  }

  @Get()
  privateRoute() {
    return { authenticated: true };
  }
}

async function createApp(nodeEnv = "production") {
  @Module({
    imports: [
      EvlogModule.forRoot({}),
      AuthModule.forRoot({
        disableTrustedOriginsCors: true,
        bodyParser: API_BODY_PARSER_OPTIONS,
        auth: betterAuth({
          secret: "native-runtime-test-secret-at-least-32-characters",
          baseURL: "http://api.example",
          trustedOrigins: ["https://app.example", "lunaris://"],
          emailAndPassword: { enabled: true },
        }),
      }),
    ],
    controllers: [NativeController, PrivateController],
    providers: [
      { provide: APP_FILTER, useClass: OriginExceptionFilter },
      { provide: APP_PIPE, useFactory: createSchemaValidationPipe },
      { provide: APP_INTERCEPTOR, useClass: ErrorInterceptor },
      { provide: APP_INTERCEPTOR, useClass: SchemaSerializerInterceptor },
    ],
  })
  class RuntimeModule {}
  const app = await NestFactory.create<NestNodeApplication>(
    RuntimeModule,
    new NodeAdapter({ trustProxy: true }),
    { logger: false, bodyParser: false }
  );
  apps.push(app);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  configureHttpSecurity(app, { ...origins, nodeEnv });
  SwaggerModule.setup("api", app, () =>
    SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
      standardSchemaConverter,
    })
  );
  await app.init();

  return app;
}

afterEach(async () => {
  while (apps.length) {
    await apps.pop()?.close();
  }
});

describe("Nest 12 native runtime", () => {
  it("accepts trusted browser, desktop and headerless clients without tokens", async () => {
    const app = await createApp();
    for (const headers of [
      {},
      { origin: "https://app.example", "sec-fetch-site": "cross-site" },
      { origin: "tauri://localhost" },
      { "tauri-origin": "lunaris://" },
      { origin: "http://api.example", host: "api.example" },
      { "sec-fetch-site": "same-origin" },
    ]) {
      const response = await injectHttp(app, {
        method: "POST",
        url: "/v1/native",
        headers,
        payload: { count: "2", ignored: true },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ count: number }>()).toEqual({ count: 2 });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("rejects untrusted, opaque, malformed and conflicting origins with headers and stable errors", async () => {
    const app = await createApp();
    events.length = 0;
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "https://sibling.example", "sec-fetch-site": "same-site" },
      { origin: "null" },
      { "tauri-origin": "null" },
      { "tauri-origin": "lunaris://invalid/path" },
      { origin: "https://app.exa mple", "sec-fetch-site": "same-origin" },
      {
        origin: "https://evil.example",
        host: "api.example",
        "x-forwarded-host": "evil.example",
      },
      { origin: "https://app.example/path", "sec-fetch-site": "same-origin" },
      { origin: "https://app.example", "tauri-origin": "lunaris://" },
      { origin: "https://evil.example", authorization: "Bearer unverified" },
      { origin: "http://localhost:5173" },
    ]) {
      const response = await injectHttp(app, {
        method: "POST",
        url: "/v1/native",
        headers,
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        reason: "auth.csrf_invalid",
        requestId: expect.any(String),
      });
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["permissions-policy"]).toBe(PERMISSIONS_POLICY);
      expect(JSON.stringify(response.json())).not.toContain("Bearer");
    }
    await Promise.resolve();
    const denials = events.filter(
      (event) =>
        (event.security as { reason?: string } | undefined)?.reason ===
        "auth.csrf_invalid"
    );
    expect(denials.length).toBeGreaterThan(0);
    for (const event of denials) {
      expect(event.requestId).toEqual(expect.any(String));
      expect(event.audit).toBeUndefined();
      expect(event.userId).toBeUndefined();
      expect(event.tenantId).toBeUndefined();
      expect(JSON.stringify(event)).not.toContain("evil.example");
      expect(JSON.stringify(event)).not.toContain("Bearer unverified");
    }
  });

  it("allows local development, preflight and safe routes", async () => {
    const app = await createApp("development");
    const mutation = await injectHttp(app, {
      method: "POST",
      url: "/v1/native",
      headers: { origin: "http://localhost:5173" },
      payload: {},
    });
    expect(mutation.statusCode).toBe(200);
    expect(mutation.headers["strict-transport-security"]).toBeUndefined();
    const preflight = await injectHttp(app, {
      method: "OPTIONS",
      url: "/v1/native",
      headers: {
        origin: "https://app.example",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["permissions-policy"]).toBe(PERMISSIONS_POLICY);
    expect(preflight.headers["access-control-allow-origin"]).toBe(
      "https://app.example"
    );
    expect(
      (
        await injectHttp(app, {
          method: "GET",
          url: "/v1/native/nullable",
        })
      ).json<{
        item: null;
      }>()
    ).toEqual({ item: null });
  });

  it("preserves the 1 MiB limit for JSON and form API requests", async () => {
    const app = await createApp();
    const padding = "x".repeat(128 * 1024);
    for (const input of [
      {
        headers: { "content-type": "application/json" },
        payload: { count: 2, padding },
      },
      {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: `count=2&padding=${padding}`,
      },
    ]) {
      const response = await injectHttp(app, {
        method: "POST",
        url: "/v1/native",
        ...input,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ count: 2 });
    }
    const oversized = await injectHttp(app, {
      method: "POST",
      url: "/v1/native",
      payload: { padding: "x".repeat(1024 * 1024) },
    });
    expect(oversized.statusCode).toBe(413);
  });

  it("preserves validation errors and native OpenAPI request/response schemas", async () => {
    const app = await createApp();
    const invalid = await injectHttp(app, {
      method: "POST",
      url: "/v1/native",
      payload: { count: -1 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      reason: "validation.failed",
      message: "Validation failed",
    });
    expect(invalid.body).not.toContain("count");
    const spec = (
      await injectHttp(app, {
        method: "GET",
        url: "/api-json",
      })
    ).json();
    const array = await injectHttp(app, {
      method: "GET",
      url: "/v1/native/array",
    });
    expect(array.json<unknown>()).toEqual([{ count: 3 }]);
    const invalidOutput = await injectHttp(app, {
      method: "GET",
      url: "/v1/native/invalid",
    });
    expect(invalidOutput.statusCode).toBe(500);
    expect(invalidOutput.body).not.toContain("private-invalid-value");
    for (const shape of ["null", "primitive", "array", "undefined"]) {
      const response = await injectHttp(app, {
        method: "GET",
        url: `/v1/native/invalid-shape?shape=${shape}`,
      });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("private-invalid-value");
    }
    const nullableRoot = await injectHttp(app, {
      method: "GET",
      url: "/v1/native/root-nullable",
    });
    expect(nullableRoot.statusCode).toBe(200);

    expect(spec).toMatchObject({
      paths: {
        "/v1/native/dates": {
          get: {
            parameters: expect.arrayContaining([
              expect.objectContaining({
                name: "from",
                schema: expect.objectContaining({
                  type: "string",
                  format: "date-time",
                }),
              }),
            ]),
          },
        },
        "/v1/native": {
          post: {
            operationId: "nativeMutation",
            requestBody: {
              content: {
                "application/json": {
                  schema: { properties: { count: expect.any(Object) } },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { properties: { count: { type: "number" } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(
      (
        await injectHttp(app, {
          method: "GET",
          url: "/api",
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await injectHttp(app, {
          method: "GET",
          url: "/v1/security/csrf",
        })
      ).statusCode
    ).toBe(404);
  });

  it("runs actual Better Auth signup, session cookies, protected routes and logout", async () => {
    const app = await createApp();
    expect(
      (
        await injectHttp(app, {
          method: "GET",
          url: "/v1/private",
        })
      ).statusCode
    ).toBe(401);
    const signup = await injectHttp(app, {
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: "https://app.example" },
      payload: {
        name: "Native Test",
        email: "native@example.com",
        password: "native-test-password",
      },
    });
    expect(signup.statusCode).toBe(200);
    const cookies = (signup.headers["set-cookie"] as string[])
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    expect(cookies).toContain("session_token");
    expect(
      (
        await injectHttp(app, {
          method: "GET",
          url: "/v1/private",
          headers: { cookie: cookies },
        })
      ).statusCode
    ).toBe(200);
    // Rust PowerSync uses authenticated reqwest requests without browser headers.
    expect(
      (
        await injectHttp(app, {
          method: "POST",
          url: "/v1/private",
          headers: { cookie: cookies },
          payload: {},
        })
      ).statusCode
    ).toBe(201);
    const desktop = await injectHttp(app, {
      method: "GET",
      url: "/v1/private",
      headers: { "tauri-origin": "lunaris://", "x-tauri-cookie": cookies },
    });
    expect(desktop.statusCode).toBe(200);
    const logout = await injectHttp(app, {
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin: "https://app.example", cookie: cookies },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(
      (logout.headers["set-cookie"] as string[]).some(
        (cookie) =>
          cookie.includes("session_token=") && cookie.includes("Max-Age=0")
      )
    ).toBe(true);
    expect(
      (
        await injectHttp(app, {
          method: "GET",
          url: "/v1/private",
        })
      ).statusCode
    ).toBe(401);
  });
});
