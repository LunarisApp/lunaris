import { describe, expect, it } from "bun:test";
import { APIError } from "better-auth/api";
import {
  lunarisTauriServer,
  validateDesktopOAuthState,
  validateGoogleAuthorizationUrl,
} from "./tauri-server";

const baseURL = "https://api.lunaris.app/auth";
const clientId = "google-client";
const now = new Date("2026-07-13T12:00:00.000Z").getTime();

function authorizationURL(overrides: Record<string, string> = {}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const values = {
    client_id: clientId,
    redirect_uri: `${baseURL}/callback/google`,
    response_type: "code",
    state: "state-value",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function expectRejected(url: URL | string) {
  expect(() =>
    validateGoogleAuthorizationUrl({
      authorizationURL: url.toString(),
      baseURL,
      googleClientId: clientId,
    })
  ).toThrow(APIError);
}

describe("Lunaris Tauri server adapter", () => {
  it("keeps upstream callback handling without its cookie request bridge", () => {
    const plugin = lunarisTauriServer({ googleClientId: clientId });
    expect(plugin.hooks?.after).toBeDefined();
    expect(plugin.onRequest).toBeUndefined();
    expect(plugin.endpoints?.tauriAuthorizationProxy).toBeDefined();
  });
});

describe("Google authorization validation", () => {
  it("accepts the exact Google authorization endpoint", () => {
    expect(
      validateGoogleAuthorizationUrl({
        authorizationURL: authorizationURL().toString(),
        baseURL,
        googleClientId: clientId,
      }).state
    ).toBe("state-value");
  });

  it("rejects invalid origins, paths, credentials, ports, and fragments", () => {
    expectRejected(
      authorizationURL().toString().replace("https://", "http://")
    );
    expectRejected(
      authorizationURL()
        .toString()
        .replace("accounts.google.com", "accounts.google.com.evil.example")
    );
    expectRejected(
      authorizationURL().toString().replace(GOOGLE_PATH, "/o/oauth2/v2/other")
    );
    expectRejected(
      authorizationURL()
        .toString()
        .replace("accounts.google.com", "user@accounts.google.com")
    );
    expectRejected(
      authorizationURL()
        .toString()
        .replace("accounts.google.com", "accounts.google.com:444")
    );
    expectRejected(
      authorizationURL()
        .toString()
        .replace("accounts.google.com", "accounts.google.com:443")
    );
    expectRejected(`${authorizationURL()}#fragment`);
  });

  it("rejects invalid client, callback, response type, state, and duplicates", () => {
    expectRejected(authorizationURL({ client_id: "other-client" }));
    expectRejected(
      authorizationURL({ redirect_uri: "https://evil.example/callback" })
    );
    expectRejected(authorizationURL({ response_type: "token" }));
    expectRejected(authorizationURL({ state: "" }));

    const duplicate = authorizationURL();
    duplicate.searchParams.append("client_id", clientId);
    expectRejected(duplicate);
  });

  it("rejects missing Google configuration", () => {
    expect(() =>
      validateGoogleAuthorizationUrl({
        authorizationURL: authorizationURL().toString(),
        baseURL,
      })
    ).toThrow(APIError);
  });
});

describe("desktop OAuth state validation", () => {
  const verification = {
    expiresAt: new Date(now + 60_000),
    value: JSON.stringify({
      callbackURL: "lunaris://auth",
      expiresAt: now + 60_000,
      oauthState: "state-value",
    }),
  };

  it("accepts an unexpired state bound to Lunaris", () => {
    expect(() =>
      validateDesktopOAuthState("state-value", verification, now)
    ).not.toThrow();
  });

  it.each([
    "lunaris://workspaces/private",
    "lunaris://auth/reset-password",
    "lunaris://auth/verify-email",
    "lunaris://auth/accept-invitation",
    "lunaris://auth/other",
    "lunaris:auth",
    "lunaris://user:pass@auth",
    "lunaris://auth:1234",
    "lunaris://auth#fragment",
  ])("rejects unapproved Lunaris callback %s", (callbackURL) => {
    expect(() =>
      validateDesktopOAuthState(
        "state-value",
        {
          ...verification,
          value: JSON.stringify({
            callbackURL,
            expiresAt: now + 60_000,
            oauthState: "state-value",
          }),
        },
        now
      )
    ).toThrow(APIError);
  });

  it("validates error and new-user callback paths", () => {
    for (const field of ["errorURL", "newUserURL"] as const) {
      expect(() =>
        validateDesktopOAuthState(
          "state-value",
          {
            ...verification,
            value: JSON.stringify({
              callbackURL: "lunaris://auth",
              expiresAt: now + 60_000,
              oauthState: "state-value",
              [field]: "lunaris://auth/reset-password",
            }),
          },
          now
        )
      ).toThrow(APIError);
    }
  });

  it("rejects missing, expired, mismatched, and foreign callback state", () => {
    expect(() => validateDesktopOAuthState("state-value", null, now)).toThrow(
      APIError
    );
    expect(() =>
      validateDesktopOAuthState(
        "state-value",
        { ...verification, expiresAt: new Date(now) },
        now
      )
    ).toThrow(APIError);
    expect(() =>
      validateDesktopOAuthState("other-state", verification, now)
    ).toThrow(APIError);
    expect(() =>
      validateDesktopOAuthState(
        "state-value",
        {
          ...verification,
          value: JSON.stringify({
            callbackURL: "https://evil.example",
            expiresAt: now + 60_000,
            oauthState: "state-value",
          }),
        },
        now
      )
    ).toThrow(APIError);
  });
});

const GOOGLE_PATH = "/o/oauth2/v2/auth";
