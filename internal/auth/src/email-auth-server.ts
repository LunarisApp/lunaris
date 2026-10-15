import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import {
  type EmailAuthResolution,
  RESOLVE_EMAIL_METHOD_PATH,
  type SocialAuthProvider,
} from "./email-auth-shared";

interface AccountLike {
  providerId: string;
}

interface EmailAccountLike {
  accounts: AccountLike[];
}

interface EmailAuthDiscoveryOptions {
  signupsAllowed?: boolean;
  socialProviders: readonly SocialAuthProvider[];
}

const resolveEmailBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export function resolveEmailAuthMethod(
  account: EmailAccountLike | null,
  socialProviders: readonly SocialAuthProvider[],
  signupsAllowed = true,
): EmailAuthResolution | null {
  if (!account) return { kind: signupsAllowed ? "register" : "password" };

  if (account.accounts.some(({ providerId }) => providerId === "credential")) {
    return { kind: "password" };
  }

  const provider = socialProviders.find((candidate) =>
    account.accounts.some(({ providerId }) => providerId === candidate),
  );

  return provider ? { kind: "social", provider } : null;
}

/**
 * Email-first routing intentionally reveals registration and linked-provider
 * state. Preserve the endpoint-specific rate limit while this product tradeoff
 * remains accepted.
 */
export function emailAuthDiscovery(
  options: EmailAuthDiscoveryOptions,
): BetterAuthPlugin {
  return {
    id: "lunaris-email-auth-discovery",
    endpoints: {
      resolveEmailMethod: createAuthEndpoint(
        RESOLVE_EMAIL_METHOD_PATH,
        {
          body: resolveEmailBodySchema,
          method: "POST",
        },
        async (ctx) => {
          const account = await ctx.context.internalAdapter.findUserByEmail(
            ctx.body.email,
            { includeAccounts: true },
          );
          const resolution = resolveEmailAuthMethod(
            account,
            options.socialProviders,
            options.signupsAllowed,
          );

          if (!resolution) {
            throw new APIError("BAD_REQUEST", {
              code: "AUTH_METHOD_UNAVAILABLE",
              message: "No supported sign-in method is available.",
            });
          }

          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json(resolution);
        },
      ),
    },
    rateLimit: [
      {
        max: 10,
        pathMatcher: (path) => path === RESOLVE_EMAIL_METHOD_PATH,
        window: 60,
      },
    ],
  };
}
