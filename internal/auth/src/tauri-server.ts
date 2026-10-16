import { tauri } from "@dreamshive/better-auth-tauri";
import { type BetterAuthPlugin, HIDE_METADATA } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { isValidLunarisOAuthCallbackUrl } from "./tauri-shared";

const GOOGLE_AUTHORIZATION_ORIGIN = "https://accounts.google.com";
const GOOGLE_AUTHORIZATION_PATH = "/o/oauth2/v2/auth";

const proxyQuerySchema = z.object({
  authorizationURL: z.string(),
  oauthState: z.string().optional(),
});

const stateDataSchema = z.looseObject({
  callbackURL: z.string(),
  errorURL: z.string().optional(),
  expiresAt: z.number(),
  newUserURL: z.string().optional(),
  oauthState: z.string(),
});

interface VerificationValue {
  expiresAt: Date;
  value: string;
}

interface LunarisTauriServerOptions {
  googleClientId?: string;
}

function invalidAuthorizationRequest(): never {
  throw new APIError("BAD_REQUEST", {
    message: "Invalid desktop authorization request",
  });
}

function hasSingleParameter(url: URL, name: string) {
  return url.searchParams.getAll(name).length === 1;
}

export function validateGoogleAuthorizationUrl({
  authorizationURL,
  baseURL,
  googleClientId,
}: {
  authorizationURL: string;
  baseURL: string;
  googleClientId?: string;
}) {
  if (!googleClientId) {
    invalidAuthorizationRequest();
  }

  let url: URL;
  try {
    url = new URL(authorizationURL);
  } catch {
    return invalidAuthorizationRequest();
  }

  if (
    !authorizationURL.startsWith(`${GOOGLE_AUTHORIZATION_ORIGIN}/`) ||
    url.origin !== GOOGLE_AUTHORIZATION_ORIGIN ||
    url.pathname !== GOOGLE_AUTHORIZATION_PATH ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hash !== ""
  ) {
    invalidAuthorizationRequest();
  }

  for (const parameter of [
    "client_id",
    "redirect_uri",
    "response_type",
    "state",
  ]) {
    if (!hasSingleParameter(url, parameter)) {
      invalidAuthorizationRequest();
    }
  }

  const state = url.searchParams.get("state");
  if (
    url.searchParams.get("client_id") !== googleClientId ||
    url.searchParams.get("redirect_uri") !== `${baseURL}/callback/google` ||
    url.searchParams.get("response_type") !== "code" ||
    !state
  ) {
    invalidAuthorizationRequest();
  }

  return {
    state,
    url,
  };
}

export function validateDesktopOAuthState(
  state: string,
  verification: VerificationValue | null,
  now = Date.now()
) {
  if (!verification || verification.expiresAt.getTime() <= now) {
    invalidAuthorizationRequest();
  }

  let value: unknown;
  try {
    value = JSON.parse(verification.value);
  } catch {
    return invalidAuthorizationRequest();
  }
  const parsed = stateDataSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.oauthState !== state ||
    parsed.data.expiresAt <= now ||
    !isValidLunarisOAuthCallbackUrl(parsed.data.callbackURL) ||
    (parsed.data.errorURL &&
      !isValidLunarisOAuthCallbackUrl(parsed.data.errorURL)) ||
    (parsed.data.newUserURL &&
      !isValidLunarisOAuthCallbackUrl(parsed.data.newUserURL))
  ) {
    invalidAuthorizationRequest();
  }
}

function createLunarisAuthorizationProxy(options: LunarisTauriServerOptions) {
  return createAuthEndpoint(
    "/tauri-authorization-proxy",
    {
      metadata: HIDE_METADATA,
      method: "GET",
      query: proxyQuerySchema,
    },
    async (ctx) => {
      const requestURL = ctx.request ? new URL(ctx.request.url) : null;
      if (
        requestURL &&
        (requestURL.searchParams.getAll("authorizationURL").length !== 1 ||
          requestURL.searchParams.getAll("oauthState").length > 1)
      ) {
        invalidAuthorizationRequest();
      }

      const { state, url } = validateGoogleAuthorizationUrl({
        authorizationURL: ctx.query.authorizationURL,
        baseURL: ctx.context.baseURL,
        googleClientId: options.googleClientId,
      });
      const verification =
        await ctx.context.internalAdapter.findVerificationValue(state);
      validateDesktopOAuthState(state, verification);

      const stateCookie = ctx.context.createAuthCookie("state", {
        maxAge: 300,
      });
      await ctx.setSignedCookie(
        stateCookie.name,
        state,
        ctx.context.secret,
        stateCookie.attributes
      );
      return ctx.redirect(url.toString());
    }
  );
}

export function lunarisTauriServer(
  options: LunarisTauriServerOptions
): BetterAuthPlugin {
  const upstream = tauri({ disableOriginOverride: true });
  const { onRequest: _unsafeCookieBridge, ...safeUpstream } = upstream;

  return {
    ...safeUpstream,
    endpoints: {
      ...safeUpstream.endpoints,
      tauriAuthorizationProxy: createLunarisAuthorizationProxy(options),
    },
  };
}
