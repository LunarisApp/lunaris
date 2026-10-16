import "./instrument";

import { standardSchemaConverter } from "@app/utils/openapi-schema";

import { EvlogLogger } from "@app/utils/evlog-logger";
import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { log } from "evlog";
import { configureHttpSecurity } from "./security/http-security";
import { AppConfig } from "./app.config";
import { AppModule } from "./app.module";

async function bootstrap() {
  // trustProxy: true makes request.protocol / request.ip honor
  // x-forwarded-* headers. Required behind any TLS-terminating proxy so
  // Fastify, Better Auth, CSRF, and cookie `secure` flags all agree on
  // the real client scheme and address. Keep this enabled on Railway and
  // any equivalent PaaS. Disable only for direct-public deployments.
  const adapter = new FastifyAdapter({ trustProxy: true });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      logger: new EvlogLogger(),
      bodyParser: false, // Disabled so better-auth can parse its own requests
    }
  );
  const appConfig = app.get(AppConfig);
  app.enableShutdownHooks();

  configureHttpSecurity(app, appConfig);

  // Enable versioning: /v1/events.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // Swagger
  const swaggerPath = "api";
  const config = new DocumentBuilder()
    .setTitle("Lunaris API")
    .setDescription("The Lunaris API documentation")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, { standardSchemaConverter });
  SwaggerModule.setup(swaggerPath, app, documentFactory);

  log.info({
    context: "Bootstrap",
    http: { swaggerPath: `/${swaggerPath}` },
    message: "Swagger endpoint ready",
  });

  const port = process.env.PORT ?? 3000;
  const host = process.env.API_BIND_ADDRESS ?? "0.0.0.0";
  await app.listen(port, host, () => {
    log.info({
      context: "Bootstrap",
      message: "API listening",
      server: { host, port },
    });
  });
}

bootstrap();
