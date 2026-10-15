import { PresenceModule } from "./presence/presence.module";
import { AuthModule } from "@app/auth";
import { DatabaseModule } from "@app/db";
import { HealthModule } from "@app/health";
import { HttpClientModule } from "@app/http-client";
import { PolarModule } from "@app/polar";
import { POSTHOG_CLIENT, PostHogModule } from "@app/posthog";
import { ResendModule } from "@app/resend";
import { StorageModule } from "@app/storage";
import { ErrorInterceptor } from "@app/utils/error.interceptor";
import { ConfigurationModule } from "./configuration/configuration.module";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { seconds, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { auditEnricher, auditRedactPreset } from "evlog";
import {
  createRequestSizeEnricher,
  createTraceContextEnricher,
  createUserAgentEnricher,
} from "evlog/enrichers";
import { EvlogModule } from "evlog/nestjs";
import { SchemaSerializerInterceptor } from "@app/utils/schema-serializer.interceptor";
import { createSchemaValidationPipe } from "@app/utils/schema-validation";
import type { PostHog } from "posthog-node";
import { PostHogInterceptor } from "posthog-node/nestjs";
import { AccountModule } from "./account/account.module";
import { AgentsModule } from "./agents/agents.module";
import { ComplianceAuditInterceptor } from "./audit/recording/audit.interceptor";
import { editionModules } from "@app/edition";
import {
  anonymizeIpAddress,
  sanitizeAuditUserAgent,
} from "./audit/recording/audit-privacy";
import { EntitlementsModule } from "./entitlements";
import { ExtensionsModule } from "./extensions/extensions.module";
import { FilesModule } from "./files/files.module";
import { appDrain } from "./instrument";
import { LoggingLifecycleService } from "./logging/logging-lifecycle.service";
import { ManifestModule } from "./manifest/manifest.module";
import { OriginExceptionFilter } from "./security/origin-exception.filter";
import { SecurityModule } from "./security/security.module";
import { SyncModule } from "./sync/sync.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { OrganizationModule } from "./organization/organization.module";
import { YjsModule } from "./yjs/yjs.module";

// Enrichers for Evlog to add more context to our logs.
const userAgent = createUserAgentEnricher();
const requestSize = createRequestSizeEnricher();
const traceContext = createTraceContextEnricher();
const enrichAudit = auditEnricher({
  tenantId: (ctx) => {
    const organization = ctx.event.organization;
    if (
      organization &&
      typeof organization === "object" &&
      "id" in organization &&
      typeof organization.id === "string"
    ) {
      return organization.id;
    }
    const target = ctx.event.audit?.target;
    return typeof target?.tenantId === "string" ? target.tenantId : undefined;
  },
});

@Module({
  imports: [
    EvlogModule.forRootAsync({
      useFactory: () => ({
        drain: appDrain,
        redact: auditRedactPreset,
        enrich: async (ctx) => {
          userAgent(ctx);
          requestSize(ctx);
          traceContext(ctx);
          await enrichAudit(ctx);
          const auditContext = ctx.event.audit?.context;
          if (typeof auditContext?.ip === "string") {
            auditContext.ip = anonymizeIpAddress(auditContext.ip);
          }
          if (typeof auditContext?.userAgent === "string") {
            auditContext.userAgent = sanitizeAuditUserAgent(
              auditContext.userAgent,
            );
          }
        },
      }),
    }),
    SentryModule.forRoot(),
    ConfigurationModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: seconds(60),
        limit: 1000,
      },
    ]),
    HttpClientModule.forRoot({ userAgent: "Lunaris/1.0" }),
    HealthModule,

    // Services
    DatabaseModule,
    StorageModule,
    ResendModule,
    PostHogModule,
    PolarModule,

    // Feature modules
    EntitlementsModule,
    ...editionModules,
    AgentsModule,
    ExtensionsModule,
    FilesModule,
    AuthModule,
    ManifestModule,
    SecurityModule,
    AccountModule,
    OrganizationModule,
    SyncModule,
    WorkspacesModule,
    YjsModule,
    PresenceModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ComplianceAuditInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    { provide: APP_FILTER, useClass: OriginExceptionFilter },
    {
      provide: APP_PIPE,
      useFactory: createSchemaValidationPipe,
    },
    { provide: APP_INTERCEPTOR, useClass: SchemaSerializerInterceptor },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [POSTHOG_CLIENT],
      useFactory: (posthog: PostHog | null) => {
        if (!posthog)
          return {
            intercept: (_: unknown, next: { handle: () => unknown }) =>
              next.handle(),
          };
        return new PostHogInterceptor(posthog, { captureExceptions: true });
      },
    },
    LoggingLifecycleService,
  ],
})
export class AppModule {}
