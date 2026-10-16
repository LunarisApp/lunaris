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
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
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
const apps: NestFastifyApplication[] = [];

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
  const app = await NestFactory.create<NestFastifyApplication>(
    RuntimeModule,
    new FastifyAdapter({ trustProxy: true }),
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
  await app.getHttpAdapter().getInstance().ready();
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
      const response = await app.inject({
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
      { origin: "https://app.example ", "sec-fetch-site": "same-origin" },
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
      const response = await app.inject({
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
    const mutation = await app.inject({
      method: "POST",
      url: "/v1/native",
      headers: { origin: "http://localhost:5173" },
      payload: {},
    });
    expect(mutation.statusCode).toBe(200);
    expect(mutation.headers["strict-transport-security"]).toBeUndefined();
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/native",
      headers: {
        origin: "https://app.example",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(
      "https://app.example"
    );
    expect(
      (await app.inject({ method: "GET", url: "/v1/native/nullable" })).json<{
        item: null;
      }>()
    ).toEqual({ item: null });
  });

  it("preserves validation errors and native OpenAPI request/response schemas", async () => {
    const app = await createApp();
    const invalid = await app.inject({
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
    const spec = (await app.inject({ method: "GET", url: "/api-json" })).json();
    const array = await app.inject({ method: "GET", url: "/v1/native/array" });
    expect(array.json<unknown>()).toEqual([{ count: 3 }]);
    const invalidOutput = await app.inject({
      method: "GET",
      url: "/v1/native/invalid",
    });
    expect(invalidOutput.statusCode).toBe(500);
    expect(invalidOutput.body).not.toContain("private-invalid-value");
    for (const shape of ["null", "primitive", "array", "undefined"]) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/native/invalid-shape?shape=${shape}`,
      });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("private-invalid-value");
    }
    const nullableRoot = await app.inject({
      method: "GET",
      url: "/v1/native/root-nullable",
    });
    expect(nullableRoot.statusCode).toBe(200);

    const from = spec.paths["/v1/native/dates"].get.parameters.find(
      (parameter: { name: string }) => parameter.name === "from"
    );
    expect(from.schema).toMatchObject({ type: "string", format: "date-time" });
    expect(spec.paths["/v1/native"].post.operationId).toBe("nativeMutation");
    expect(
      spec.paths["/v1/native"].post.requestBody.content["application/json"]
        .schema.properties.count
    ).toBeDefined();
    expect(
      spec.paths["/v1/native"].post.responses["200"].content["application/json"]
        .schema.properties.count.type
    ).toBe("number");
    expect((await app.inject({ method: "GET", url: "/api" })).statusCode).toBe(
      200
    );
    expect(
      (await app.inject({ method: "GET", url: "/v1/security/csrf" })).statusCode
    ).toBe(404);
  });

  it("runs actual Better Auth signup, session cookies, protected routes and logout", async () => {
    const app = await createApp();
    expect(
      (await app.inject({ method: "GET", url: "/v1/private" })).statusCode
    ).toBe(401);
    const signup = await app.inject({
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
    const cookies = signup.cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    expect(cookies).toContain("session_token");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/private",
          headers: { cookie: cookies },
        })
      ).statusCode
    ).toBe(200);
    // Rust PowerSync uses authenticated reqwest requests without browser headers.
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private",
          headers: { cookie: cookies },
          payload: {},
        })
      ).statusCode
    ).toBe(201);
    const desktop = await app.inject({
      method: "GET",
      url: "/v1/private",
      headers: { "tauri-origin": "lunaris://", "x-tauri-cookie": cookies },
    });
    expect(desktop.statusCode).toBe(200);
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin: "https://app.example", cookie: cookies },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(
      logout.cookies.some(
        (cookie) => cookie.name.includes("session_token") && cookie.maxAge === 0
      )
    ).toBe(true);
    expect(
      (await app.inject({ method: "GET", url: "/v1/private" })).statusCode
    ).toBe(401);
  });
});
