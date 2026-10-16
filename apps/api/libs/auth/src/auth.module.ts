import { organizationTeams } from "@app/edition";
import { capacityAdapter } from "../../../src/auth/capacity-adapter";
import { assertAuthOrganizationAccess } from "../../../src/organization/deletion/auth-organization-access";
import { DatabaseService } from "@app/db";
import { PolarConfig } from "@app/polar";
import { RedisConfig } from "@app/redis";
import { RESEND_CLIENT, ResendConfig } from "@app/resend";
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common";
import { createAuth } from "@repo/auth/server";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import type { Resend } from "resend";
import { AppConfig } from "../../../src/app.config";
import { recordAuthAudit } from "../../../src/audit/recording/audit-auth";
import { authSchema } from "../../../src/auth/auth.entity";
import {
  EntitlementsModule,
  EntitlementsService,
  PolarWebhookHandlers,
} from "../../../src/entitlements";
import { workspacesDb } from "../../../src/workspaces/core/workspaces.entity";
import { AuthConfig } from "./auth.config";
import { AuthIdentifyMiddleware } from "./auth-identify.middleware";
import { canDisableEmailVerification } from "./flag.utils";

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      imports: [EntitlementsModule],
      inject: [
        DatabaseService,
        AppConfig,
        RedisConfig,
        PolarConfig,
        AuthConfig,
        RESEND_CLIENT,
        ResendConfig,
        PolarWebhookHandlers,
        EntitlementsService,
      ],
      useFactory: (
        dbService: DatabaseService,
        appConfig: AppConfig,
        redisConfig: RedisConfig,
        polarConfig: PolarConfig,
        authConfig: AuthConfig,
        resend: Resend | null,
        resendConfig: ResendConfig,
        polarWebhookHandlers: PolarWebhookHandlers,
        entitlementsService: EntitlementsService
      ) => {
        const emailVerificationDisabled = canDisableEmailVerification(
          appConfig.nodeEnv,
          authConfig.emailVerificationDisabled,
          authConfig.selfHosted
        );
        const polarValues = polarConfig.enabled
          ? polarConfig.values
          : undefined;
        return {
          auth: createAuth(dbService.db, {
            database: capacityAdapter(
              dbService,
              authSchema,
              entitlementsService
            ),
            audit: recordAuthAudit,
            assertOrganizationAccess: (input) =>
              assertAuthOrganizationAccess(dbService.db, input),
            backendUrl: appConfig.url,
            desktopOrigins: appConfig.desktopAppOrigins,
            disableEmailVerification: emailVerificationDisabled,
            signupsAllowed: authConfig.signupsAllowed,
            emailFrom: resendConfig.from,
            emailReplyTo: resendConfig.replyTo,
            schema: authSchema,
            organizationTeams,
            frontendUrl: appConfig.frontendUrl,
            socialProviders: authConfig.values,
            redisConfig: redisConfig.values,
            organizationPlans: {
              assertCanRemoveMember: async (userId, organizationId) => {
                const [ownedWorkspace] = await dbService.db
                  .select({ id: workspacesDb.id })
                  .from(workspacesDb)
                  .where(
                    and(
                      eq(workspacesDb.organizationId, organizationId),
                      eq(workspacesDb.ownerId, userId)
                    )
                  )
                  .limit(1);
                if (ownedWorkspace) {
                  throw new APIError("CONFLICT", {
                    code: "PRIVATE_WORKSPACE_TRANSFER_REQUIRED",
                    message:
                      "Transfer private workspace ownership before removing this member",
                  });
                }
              },
              canCreateOwnedOrganization: (userId) =>
                entitlementsService.canCreateOwnedOrganization(userId),
              canManageBilling: (userId, organizationId) =>
                entitlementsService.canManageBilling(userId, organizationId),
              hasMemberCapacity: (organizationId, options) =>
                entitlementsService.hasMemberCapacity(organizationId, options),
              getMemberLimit: (organizationId) =>
                entitlementsService.getMemberLimit(organizationId),
              hasMembers: (organizationId) =>
                entitlementsService.hasMembers(organizationId),
              syncMemberSeats: (organizationId) =>
                entitlementsService.syncMemberSeats(organizationId),
            },
            polarConfig: polarValues
              ? {
                  accessToken: polarValues.accessToken,
                  sandbox: polarValues.sandbox,
                  webhookSecret: polarValues.webhookSecret,
                  webhookCallbacks: polarWebhookHandlers.toCallbacks(),
                }
              : undefined,
            resend,
          }),
        };
      },
    }),
  ],
  providers: [AuthIdentifyMiddleware],
  exports: [BetterAuthModule],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthIdentifyMiddleware).forRoutes("*");
  }
}
