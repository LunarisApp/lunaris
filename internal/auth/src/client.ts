import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { polarClient } from "@polar-sh/better-auth/client";
import type {
  BetterAuthClientPlugin,
  InferActions,
} from "better-auth/client";
import {
  anonymousClient,
  inferOrgAdditionalFields,
  jwtClient,
  lastLoginMethodClient,
  multiSessionClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient as createAuthClientExternal } from "better-auth/react";
import { startupCachePlugin } from "./startup-cache";
import {
  BASE_PATH,
  LAST_LOGIN_METHOD_COOKIE_NAME,
} from "./constants";
import { emailAuthDiscoveryClient } from "./email-auth-client";
import {
  organizationAccessControl,
  organizationRolesWithLegacyAliases,
} from "./permissions";

export { LAST_LOGIN_METHOD_COOKIE_NAME } from "./constants";
export type {
  EmailAuthResolution,
  SocialAuthProvider,
} from "./email-auth-shared";
export { emailAuthResolutionSchema } from "./email-auth-shared";

interface CreateAuthOptions<
  Plugins extends BetterAuthClientPlugin[] = BetterAuthClientPlugin[],
> {
  baseURL: string;
  customFetchImpl?: typeof fetch;
  passkeys?: boolean;
  plugins?: Plugins;
}

function passkeyCapabilityClient(enabled: boolean) {
  return {
    id: "lunaris-passkey-capability",
    getActions: () => ({ supportsPasskeys: () => enabled }),
  } satisfies BetterAuthClientPlugin;
}

function accountSwitchSignalsClient() {
  return {
    id: "lunaris-account-switch-signals",
    atomListeners: [
      {
        matcher: (path) => path === "/multi-session/set-active",
        signal: "$activeOrgSignal",
      },
    ],
  } satisfies BetterAuthClientPlugin;
}

function withStableFunctionName<Client extends object>(
  client: Client,
): Client & { readonly name: string } {
  return new Proxy(client, {
    get(target, property) {
      if (property === "name") return "LunarisAuthClient";
      return Reflect.get(target, property, target);
    },
  }) as Client & { readonly name: string };
}

function createAuthClientInternal({
  baseURL,
  customFetchImpl,
  passkeys = true,
  plugins = [],
}: CreateAuthOptions) {
  const pluginsBeforePasskeys = [
    anonymousClient(),
    jwtClient(),
    organizationClient({
      ac: organizationAccessControl,
      roles: organizationRolesWithLegacyAliases,
      teams: {
        enabled: true,
      },
      schema: inferOrgAdditionalFields({
        organization: {
          additionalFields: {
            isPersonal: {
              type: "boolean",
              required: false,
              defaultValue: false,
            },
            deletionRequestedAt: {
              type: "date",
              required: false,
              input: false,
            },
            deletionPurgeAfter: { type: "date", required: false, input: false },
            yjsRetentionDays: {
              type: "number",
              required: false,
              defaultValue: 7,
            },
          },
        },
      } as const),
    }),
    twoFactorClient(),
    multiSessionClient(),
    accountSwitchSignalsClient(),
    oauthProviderClient(),
    emailAuthDiscoveryClient(),
    lastLoginMethodClient({
      cookieName: LAST_LOGIN_METHOD_COOKIE_NAME,
    }),
  ] as const;
  const passkeyPlugin = passkeyClient();
  const pluginsAfterPasskeys = [
    passkeyCapabilityClient(passkeys),
  ] as const;

  // Keep Better Auth's inferred public API free of runtime-only plugins whose
  // broad types would erase actions from the precise plugin tuple.
  const typedPlugins = [
    ...pluginsBeforePasskeys,
    passkeyPlugin,
    ...pluginsAfterPasskeys,
  ];
  const configuredPlugins = [
    ...pluginsBeforePasskeys,
    ...(passkeys ? [passkeyPlugin] : []),
    ...pluginsAfterPasskeys,
    startupCachePlugin({ baseURL }),
    polarClient() as BetterAuthClientPlugin,
    ...plugins,
  ] as unknown as typeof typedPlugins;

  return withStableFunctionName(
    createAuthClientExternal({
      baseURL,
      basePath: BASE_PATH,
      fetchOptions: customFetchImpl ? { customFetchImpl } : undefined,
      plugins: configuredPlugins,
    }),
  );
}

export type AuthClient = ReturnType<typeof createAuthClientInternal>;

export function createAuthClient<
  const Plugins extends BetterAuthClientPlugin[],
>(
  options: CreateAuthOptions<Plugins> & { plugins: Plugins },
): AuthClient & InferActions<{ plugins: Plugins }>;
export function createAuthClient(options: CreateAuthOptions): AuthClient;
export function createAuthClient(options: CreateAuthOptions): AuthClient {
  return createAuthClientInternal(options);
}
