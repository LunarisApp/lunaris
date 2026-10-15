import crypto from "node:crypto";
import { apiKey } from "@better-auth/api-key";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { redisStorage } from "@better-auth/redis-storage";
import { polar, portal, type WebhooksOptions, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import type { Auth as BetterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import {
  anonymous,
  jwt,
  lastLoginMethod,
  multiSession,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { getOrgAdapter } from "better-auth/plugins/organization";
import { createLogger, log } from "evlog";
import Redis from "ioredis";
import type { Resend } from "resend";
import { buildAgentApiKeyOptions } from "./agent-api-key";
import { adoptAnonymousOrganizationOnLink } from "./anonymous-account-link";
import {
  BASE_PATH,
  LAST_LOGIN_METHOD_COOKIE_NAME,
  LAST_LOGIN_METHOD_MAX_AGE,
} from "./constants";
import { emailAuthDiscovery } from "./email-auth-server";
import {
  organizationAccessControl,
  organizationRolesWithLegacyAliases,
} from "./permissions";
import { lunarisTauriServer } from "./tauri-server";
import {
  applyRetentionDefaults,
  assertCanAcceptOrganizationInvitation,
  assertCanAddOrganizationRole,
  assertCanRemoveOrganizationMember,
  assertCanUpdateOrganizationRole,
  assertOrganizationIsJoinable,
  assertOrganizationMemberCapacity,
  assertOrganizationTypeImmutable,
  DEFAULT_YJS_RETENTION_DAYS,
  syncOrganizationMemberSeats,
  type OrganizationPlanCallbacks,
} from "./organization-policy";

export {
  agentApiKeyMetadataSchema,
  buildAgentApiKeyOptions,
} from "./agent-api-key";
export {
  assertCanAcceptOrganizationInvitation,
  assertCanAddOrganizationRole,
  assertCanRemoveOrganizationMember,
  assertCanUpdateOrganizationRole,
  assertOrganizationTypeImmutable,
  syncOrganizationMemberSeats,
  type OrganizationPlanCallbacks,
} from "./organization-policy";

type DrizzleDb = Parameters<typeof drizzleAdapter>[0];
const ANONYMOUS_EMAIL_DOMAIN = "anon.lunaris.app";
const ORGANIZATION_BILLING_OWNER_REQUIRED = "ORGANIZATION_BILLING_OWNER_REQUIRED";
const WELCOME_EMAIL_REPLY_TO = "Roman <roman@lunaris.app>";
const WELCOME_EMAIL_DELAY_MS = 5 * 60 * 1000;

export function createLastLoginMethodPlugin() {
  return lastLoginMethod({
    cookieName: LAST_LOGIN_METHOD_COOKIE_NAME,
    maxAge: LAST_LOGIN_METHOD_MAX_AGE,
    storeInDatabase: false,
  });
}

interface SocialProviderConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Optional webhook event handlers forwarded to the Polar `webhooks()` plugin.
 * Typed via `WebhooksOptions` from `@polar-sh/better-auth`. Consumers can
 * supply any subset of callbacks (e.g. only subscription events).
 */
export type PolarWebhookCallbacks = Omit<WebhooksOptions, "secret">;

interface CreateAuthOptions {
  assertOrganizationAccess?: (input: {
    path: string;
    body: unknown;
    activeOrganizationId?: string | null;
  }) => Promise<void>;
  audit?: (event: {
    actorId?: string;
    changedFields?: string[];
    outcome: "success" | "failure" | "denied";
    path: string;
    reason?: string;
    targetId?: string;
    tenantId?: string;
  }) => void | Promise<void>;
  backendUrl?: string;
  database?: ReturnType<typeof drizzleAdapter>;
  desktopOrigins?: string[];
  disableEmailVerification?: boolean;
  emailFrom?: string;
  emailReplyTo?: string;
  frontendUrl: string;
  organizationPlans?: OrganizationPlanCallbacks;
  organizationTeams?: { enabled: boolean };
  polarConfig?: {
    accessToken: string;
    webhookSecret: string;
    sandbox?: boolean;
    webhookCallbacks?: PolarWebhookCallbacks;
  };
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
  };
  resend?: Resend | null;
  schema?: Record<string, any>;
  signupsAllowed?: boolean;
  socialProviders?: {
    google?: SocialProviderConfig;
  };
}

function bodyString(
  body: unknown,
  ...keys: string[]
): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

const TEAM_TARGET_PATHS = new Set([
  "/organization/add-team-member",
  "/organization/remove-team",
  "/organization/remove-team-member",
  "/organization/update-team",
]);

function authTargetId(path: string, body: unknown): string | undefined {
  return (
    bodyString(body, "memberId", "invitationId", "id") ??
    (TEAM_TARGET_PATHS.has(path) ? bodyString(body, "teamId") : undefined)
  );
}

function authTenantId(body: unknown): string | undefined {
  const direct = bodyString(body, "organizationId");
  if (direct || !body || typeof body !== "object") return direct;
  return bodyString((body as Record<string, unknown>).data, "organizationId");
}

function bodyFields(body: unknown): string[] | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const fields = Object.keys(body).sort();
  return fields.length ? fields : undefined;
}

type JwtApi = {
  signJWT: (input: {
    body: {
      payload: Record<string, unknown>;
      overrideOptions?: Record<string, unknown>;
    };
  }) => Promise<{ token: string }>;
};

export type Auth = BetterAuth & {
  api: BetterAuth["api"] & JwtApi;
};

function createEmailSender(resend: Resend | null, options: CreateAuthOptions) {
  return async (opts: {
    to: string;
    subject: string;
    html: string;
    action: string;
  }) => {
    if (resend) {
      const result = await resend.emails.send({
        from: options.emailFrom ?? "Lunaris <noreply@mail.lunaris.app>",
        replyTo: options.emailReplyTo ?? (process.env.DEPLOYMENT_MODE === "self-hosted" ? undefined : "Lunaris <hello@lunaris.app>"),
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
      if (result.error) throw new Error("Email delivery failed");
    } else {
      // Cypress needs the one-time URL to exercise email auth flows. Keep this
      // outside evlog so the compliance redactor remains enabled for every
      // normal application and audit event.
      if (process.env.E2E_AUTH_EMAIL_LOGS === "true") {
        process.stdout.write(
          `${JSON.stringify({
            auth: {
              action: opts.action,
              email: opts.to,
              html: opts.html,
            },
            task: "auth",
          })}\n`,
        );
      }
      const emailLog = createLogger({ task: "auth" });
      emailLog.set({ auth: { action: opts.action, email: opts.to, html: opts.html } });
      emailLog.warn("Resend not configured, email not sent");
      emailLog.emit();
    }
  };
}

async function scheduleWelcomeEmail(
  resend: Resend | null,
  user: {
    email: string;
    id: string;
    isAnonymous?: boolean | null;
    name: string;
  },
) {
  if (
    process.env.DEPLOYMENT_MODE === "self-hosted" ||
    !resend ||
    user.isAnonymous === true ||
    user.email.endsWith(`@${ANONYMOUS_EMAIL_DOMAIN}`)
  ) {
    return;
  }

  const text = [
    `Hi ${user.name},`,
    "",
    "I'm Roman, the founder of Lunaris. Just saw you signed up.",
    "",
    "What brought you here, and what are you hoping to use Lunaris for? Just reply to this email — I read every response.",
    "",
    "Roman",
  ].join("\n");

  try {
    const result = await resend.emails.send(
      {
        from: "Lunaris <noreply@mail.lunaris.app>",
        replyTo: WELCOME_EMAIL_REPLY_TO,
        scheduledAt: new Date(
          Date.now() + WELCOME_EMAIL_DELAY_MS,
        ).toISOString(),
        subject: "Welcome to Lunaris",
        text,
        to: user.email,
      },
      {
        idempotencyKey: `welcome-user/${user.id}`,
      },
    );
    if (result.error) {
      log.error({
        context: "BetterAuth",
        message: "Welcome email scheduling failed",
        args: [result.error, { userId: user.id }],
      });
    }
  } catch (error) {
    log.error({
      context: "BetterAuth",
      message: "Welcome email scheduling failed",
      args: [error, { userId: user.id }],
    });
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInvitationLink(frontendUrl: string, invitationId: string) {
  const url = new URL("/auth/accept-invitation", frontendUrl);
  url.searchParams.set("invitationId", invitationId);
  return url.toString();
}

export function buildPasskeyConfig(frontendUrl: string) {
  const frontendOrigin = new URL(frontendUrl).origin;
  return {
    origin: frontendOrigin,
    rpID: new URL(frontendOrigin).hostname,
    rpName: "Lunaris",
  } as const;
}

export function buildAuthServerOptions(backendUrl?: string) {
  const baseURL = backendUrl?.replace(/\/$/, "");
  return {
    baseURL,
    jwt: baseURL
      ? { jwt: { issuer: `${baseURL}${BASE_PATH}` } }
      : undefined,
  };
}

export function buildSelfHostedCookieOptions(backendUrl: string) {
  const secure = new URL(backendUrl).protocol === "https:";
  return {
    useSecureCookies: secure,
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { sameSite: "lax" as const, secure, httpOnly: true },
  };
}

export function createAuth(db: DrizzleDb, options: CreateAuthOptions): Auth {
  const sendEmail = createEmailSender(options.resend ?? null, options);
  const emailVerificationDisabled = options.disableEmailVerification === true;
  const passkeyConfig = buildPasskeyConfig(options.frontendUrl);
  const authServer = buildAuthServerOptions(options.backendUrl);
  const backendUrl = authServer.baseURL;

  return betterAuth({
    appName: "Lunaris",
    baseURL: authServer.baseURL,
    basePath: BASE_PATH,
    logger: {
      log: (level, message, ...args) => {
        const event = { context: "BetterAuth", message, args: args.length ? args : undefined };
        switch (level) {
          case "error":
            log.error(event);
            break;
          case "warn":
            log.warn(event);
            break;
          case "debug":
            log.debug(event);
            break;
          default:
            log.info(event);
            break;
        }
      },
    },
    database: options.database ?? drizzleAdapter(db, {
      provider: "pg",
      schema: options.schema,
    }),
    onAPIError: {
      onError: async (error, ctx) => {
        const session = ctx.session ?? ctx.newSession;
        await options.audit?.({
          actorId: session?.user.id,
          outcome:
            error instanceof APIError &&
            (error.statusCode === 401 || error.statusCode === 403)
              ? "denied"
              : "failure",
          path: "",
          reason: error instanceof Error ? error.message : "Auth action failed",
          tenantId: session?.session.activeOrganizationId,
        });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/request-password-reset" && !options.resend && process.env.E2E_AUTH_EMAIL_LOGS !== "true") {
          throw new APIError("FORBIDDEN", {
            code: "EMAIL_RECOVERY_DISABLED",
            message: "Email recovery is unavailable. Contact your server administrator.",
          });
        }
        if (options.signupsAllowed === false &&
            (ctx.path === "/sign-up/email" || ctx.path === "/sign-in/anonymous")) {
          throw new APIError("FORBIDDEN", {
            code: "SIGNUP_DISABLED",
            message: "Registration is disabled on this server.",
          });
        }
        if (
          ctx.path.startsWith("/organization/") ||
          ctx.path === "/customer/portal"
        ) {
          const current = await getAuthoritativeSessionFromCtx<
            Record<never, never>,
            { activeOrganizationId?: string | null }
          >(ctx);
          await options.assertOrganizationAccess?.({
            path: ctx.path,
            body: ctx.body,
            activeOrganizationId: current?.session.activeOrganizationId,
          });
        }
        if (ctx.path !== "/customer/portal") return;
        const session = await getAuthoritativeSessionFromCtx<
          Record<never, never>,
          { activeOrganizationId?: string | null }
        >(ctx);
        const organizationId = session?.session.activeOrganizationId;
        if (
          !organizationId ||
          !options.organizationPlans ||
          !(await options.organizationPlans.canManageBilling(
            session.user.id,
            organizationId,
          ))
        ) {
          throw new APIError("FORBIDDEN", {
            code: ORGANIZATION_BILLING_OWNER_REQUIRED,
            message: "Only the organization owner can manage billing.",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const session = ctx.context.newSession ?? ctx.context.session;
        await options.audit?.({
          actorId: session?.user.id,
          changedFields: bodyFields(ctx.body),
          outcome: "success",
          path: ctx.path,
          targetId: authTargetId(ctx.path, ctx.body),
          tenantId:
            authTenantId(ctx.body) ?? session?.session.activeOrganizationId,
        });
      }),
    },
    socialProviders: {
      ...(options.socialProviders?.google && {
        google: { ...options.socialProviders.google, disableSignUp: options.signupsAllowed === false },
      }),
    },
    account: {
      identityStrategy: "provider-id",
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.signupsAllowed === false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your password",
          html: `<p>Hi ${user.name},</p><p>Click <a href="${url}">here</a> to reset your password.</p><p>If you didn't request this, ignore this email.</p>`,
          action: "reset-password",
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      afterEmailVerification: async (user) => {
        await scheduleWelcomeEmail(options.resend ?? null, user);
      },
      sendVerificationEmail: async ({ user, url }) => {
        if (emailVerificationDisabled) {
          log.info({
            context: "BetterAuth",
            message: "Email verification disabled, skipping verification email",
            args: [{ email: user.email }],
          });
          return;
        }
        await sendEmail({
          to: user.email,
          subject: "Verify your email",
          html: `<p>Hi ${user.name},</p><p>Click <a href="${url}">here</a> to verify your email address.</p><p>If you didn't create this account, ignore this email.</p>`,
          action: "verify-email",
        });
      },
    },
    plugins: [
      apiKey(buildAgentApiKeyOptions()),
      ...(backendUrl
        ? [
            oauthProvider({
              allowDynamicClientRegistration: true,
              allowUnauthenticatedClientRegistration: true,
              clientRegistrationAllowedScopes: [
                "openid",
                "profile",
                "offline_access",
                "organization:read",
                "organization:manage",
                "workspace:read",
                "workspace:write",
                "workspace:delete",
                "content:read",
                "file:read",
              ],
              clientRegistrationDefaultScopes: [
                "openid",
                "profile",
                "organization:read",
                "workspace:read",
                "content:read",
                "file:read",
              ],
              consentPage: `${options.frontendUrl}/auth/agent-consent`,
              loginPage: `${options.frontendUrl}/auth`,
              enforcePerClientResources: false,
              resources: [backendUrl, `${backendUrl}/mcp`],
              scopes: [
                "openid",
                "profile",
                "offline_access",
                "organization:read",
                "organization:manage",
                "workspace:read",
                "workspace:write",
                "workspace:delete",
                "content:read",
                "file:read",
              ],
            }),
          ]
        : []),
      emailAuthDiscovery({
        signupsAllowed: options.signupsAllowed,
        socialProviders: options.socialProviders?.google ? ["google"] : [],
      }),
      createLastLoginMethodPlugin(),
      ...(options.desktopOrigins?.length
        ? [
            lunarisTauriServer({
              googleClientId: options.socialProviders?.google?.clientId,
            }),
          ]
        : []),
      anonymous({
        emailDomainName: ANONYMOUS_EMAIL_DOMAIN,
        onLinkAccount: async ({ anonymousUser, newUser, ctx }) => {
          const adapter = getOrgAdapter(ctx.context);

          // guest session
          //   -> create local workspace under guest org
          //   -> claim account
          //   -> adopt guest org onto claimed user
          //   -> delete empty claimed org
          //   -> point claimed sessions at guest org
          await adoptAnonymousOrganizationOnLink({
            adapter,
            internalAdapter: ctx.context.internalAdapter,
            anonymousUserId: anonymousUser.user.id,
            claimedUserId: newUser.user.id,
          });
        },
      }),
      multiSession(),
      jwt(authServer.jwt),
      passkey(passkeyConfig),
      twoFactor({ issuer: "Lunaris" }),
      organization({
        ac: organizationAccessControl,
        disableOrganizationDeletion: true,
        membershipLimit: (_user, organization) =>
          options.organizationPlans?.getMemberLimit(organization.id) ??
          Number.MAX_SAFE_INTEGER,
        requireEmailVerificationOnInvitation: true,
        roles: organizationRolesWithLegacyAliases,
        teams: { enabled: options.organizationTeams?.enabled ?? false },
        organizationLimit: async (user) =>
          options.organizationPlans
            ? !(await options.organizationPlans.canCreateOwnedOrganization(user.id))
            : false,
        sendInvitationEmail: async (data) => {
          const invitationUrl = buildInvitationLink(options.frontendUrl, data.id);
          const inviterName = escapeHtml(data.inviter.user.name);
          const orgName = escapeHtml(data.organization.name);
          const role = escapeHtml(data.role);
          await sendEmail({
            to: data.email,
            subject: `${data.inviter.user.name} invited you to ${data.organization.name}`,
            html: `<p>Hi,</p><p>${inviterName} invited you to join <strong>${orgName}</strong> on Lunaris as <strong>${role}</strong>.</p><p><a href="${invitationUrl}">Accept invitation</a></p><p>If this wasn't expected, you can ignore this email.</p>`,
            action: "organization-invitation",
          });
        },
        schema: {
          invitation: {
            additionalFields: {
              seatReserved: { type: "boolean", required: false, defaultValue: false, input: false },
            },
          },
          organization: {
            additionalFields: {
              developerMode: {
                type: "boolean",
                required: false,
                defaultValue: false,
                input: false,
              },
              isPersonal: {
                type: "boolean",
                required: false,
                defaultValue: false,
                input: false,
              },
              deletionRequestedAt: {
                type: "date",
                required: false,
                input: false,
              },
              deletionPurgeAfter: {
                type: "date",
                required: false,
                input: false,
              },
              yjsRetentionDays: {
                type: "number",
                required: false,
                defaultValue: DEFAULT_YJS_RETENTION_DAYS,
              },
            },
          },
        },
        organizationHooks: {
          beforeCreateOrganization: async ({ organization }) => ({
            data: {
              ...applyRetentionDefaults(organization, "create"),
              isPersonal: false,
            },
          }),
          beforeUpdateOrganization: async ({ organization }) => {
            assertOrganizationTypeImmutable(organization);
            return { data: applyRetentionDefaults(organization, "update") };
          },
          beforeCreateInvitation: async ({ invitation, organization }) => {
            assertOrganizationIsJoinable(organization);
            assertCanAddOrganizationRole(invitation.role, true);
            if (!options.organizationPlans) return;
            assertOrganizationMemberCapacity(
              await options.organizationPlans.hasMemberCapacity(organization.id, {
                includePendingInvitations: true,
              }),
            );
          },
          beforeAcceptInvitation: async ({ organization }) => {
            await assertCanAcceptOrganizationInvitation({
              organization,
              organizationPlans: options.organizationPlans,
            });
          },
          afterAcceptInvitation: async ({ organization }) =>
            syncOrganizationMemberSeats(options.organizationPlans, organization.id),
          beforeAddMember: async ({ member, organization }) => {
            assertOrganizationIsJoinable(organization);
            assertCanAddOrganizationRole(
              member.role,
              (await options.organizationPlans?.hasMembers(organization.id)) ??
                false,
            );
            if (!options.organizationPlans) return;
            assertOrganizationMemberCapacity(
              await options.organizationPlans.hasMemberCapacity(organization.id, {
                includePendingInvitations: true,
              }),
            );
          },
          afterAddMember: async ({ organization }) =>
            syncOrganizationMemberSeats(options.organizationPlans, organization.id),
          beforeRemoveMember: async ({ member, organization }) => {
            assertOrganizationIsJoinable(organization);
            assertCanRemoveOrganizationMember(member.role);
            await options.organizationPlans?.assertCanRemoveMember?.(
              member.userId,
              organization.id,
            );
          },
          afterRemoveMember: async ({ organization }) =>
            syncOrganizationMemberSeats(options.organizationPlans, organization.id),
          beforeUpdateMemberRole: async ({ member, newRole }) => {
            assertCanUpdateOrganizationRole(member.role, newRole);
          },
        },
      }),
      ...(options.polarConfig
        ? [
            polar({
              client: new Polar({
                accessToken: options.polarConfig.accessToken,
                server:
                  options.polarConfig.sandbox !== false
                    ? "sandbox"
                    : "production",
              }),
              createCustomerOnSignUp: true,
              use: [
                portal({
                  returnUrl: `${options.frontendUrl}/`,
                }),
                webhooks({
                  secret: options.polarConfig.webhookSecret,
                  ...(options.polarConfig.webhookCallbacks ?? {}),
                }),
              ],
            }),
          ]
        : []),
    ],
    session: {
      cookieCache: {
        enabled: process.env.DEPLOYMENT_MODE !== "self-hosted",
        maxAge: 60 * 60 * 3, // 3 hours, in seconds
      },
      storeSessionInDatabase: true,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Last line of enforcement for every user-creation path, including plugins.
            if (options.signupsAllowed === false) {
              throw new APIError("FORBIDDEN", {
                code: "SIGNUP_DISABLED",
                message: "Registration is disabled on this server.",
              });
            }
            if (!emailVerificationDisabled) return;
            return {
              data: {
                ...user,
                emailVerified: true,
              },
            };
          },
          after: async (user, ctx) => {
            if (user.emailVerified) {
              await scheduleWelcomeEmail(options.resend ?? null, user);
            }
            if (!ctx) return;
            const adapter = getOrgAdapter(ctx.context);
            const name = "Personal";
            const slug = crypto.randomBytes(4).toString("hex");
            const org = await adapter.createOrganization({
              organization: {
                name,
                slug,
                isPersonal: true,
                createdAt: new Date(),
              },
            });
            await adapter.createMember({
              organizationId: org.id,
              userId: user.id,
              role: "owner",
              createdAt: new Date(),
            });
            // Fix race condition: session may already exist without
            // activeOrganizationId because session.create.before runs
            // before this hook completes during signup.
            const sessions = await ctx.context.internalAdapter.listSessions(
              user.id
            );
            for (const session of sessions) {
              const s = session as Record<string, unknown>;
              if (!s.activeOrganizationId) {
                await ctx.context.internalAdapter.updateSession(session.token, {
                  activeOrganizationId: org.id,
                });
              }
            }
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            if (!ctx || session.activeOrganizationId) return;
            const adapter = getOrgAdapter(ctx.context);
            const orgs = await adapter.listOrganizations(session.userId);
            const firstOrg = orgs[0];
            if (!firstOrg) return;
            return {
              data: { ...session, activeOrganizationId: firstOrg.id },
            };
          },
        },
      },
    },
    trustedOrigins: [
      options.frontendUrl,
      ...(options.desktopOrigins ?? []),
      ...(process.env.NODE_ENV !== "production"
        ? ["http://localhost:*", "http://127.0.0.1:*"]
        : []),
    ],
    secondaryStorage: options.redisConfig
      ? redisStorage({
          client: new Redis({
            host: options.redisConfig.host,
            port: options.redisConfig.port,
            password: options.redisConfig.password,
          }),
          keyPrefix: "auth:",
        })
      : undefined,
    advanced: {
      cookiePrefix: "lunaris",
      ...(process.env.DEPLOYMENT_MODE === "self-hosted"
        ? buildSelfHostedCookieOptions(backendUrl!)
        : process.env.NODE_ENV === "production"
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: ".lunaris.app",
            },
            defaultCookieAttributes: {
              sameSite: "none" as const,
              secure: true,
              httpOnly: true,
            },
          }
        : {
            defaultCookieAttributes: {
              httpOnly: true,
            },
          }),
    },
  }) as unknown as Auth;
}
