import { describe, expect, it } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt, organization } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { oauthDeviceAuthorization } from "@better-auth/oauth-provider";
import { createHash } from "node:crypto";
import {
  agentAuthorization,
  resolveAgentAuthorization,
} from "./agent-authorization";

const resource = "http://localhost:3000/mcp";
async function fixture() {
  const db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    oauthClient: [],
    oauthResource: [],
    oauthClientResource: [],
    oauthAccessToken: [],
    oauthRefreshToken: [],
    oauthConsent: [],
    oauthClientAssertion: [],
    jwks: [],
    deviceCode: [],
    agentAuthorization: [],
  } as Record<string, Record<string, unknown>[]>;
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-at-least-thirty-two-characters",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [
      jwt(),
      organization(),
      mcp({
        resource,
        loginPage: "/login",
        consentPage: "/consent",
        scopes: ["openid", "offline_access", "organization:read"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      oauthDeviceAuthorization({
        verificationUri: "http://localhost:5173/auth/device",
        validateClient: async () => false,
      }),
      agentAuthorization([resource]),
    ],
  });
  const signup = await auth.api.signUpEmail({
    body: {
      email: "owner@example.com",
      password: "password12345",
      name: "Owner",
    },
    asResponse: true,
  });
  const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
  const user = db.user![0]!;
  user.emailVerified = true;
  db.organization!.push({
    id: "org-1",
    name: "Allowed",
    slug: "allowed",
    createdAt: new Date(),
  });
  db.member!.push({
    id: "member-1",
    userId: user.id,
    organizationId: "org-1",
    role: "owner",
    createdAt: new Date(),
  });
  const call = async (path: string, body?: unknown, authenticated = false) => {
    const form = path === "/oauth2/token";
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body
            ? {
                "content-type": form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
              }
            : {}),
          ...(authenticated ? { cookie, origin: "http://localhost:3000" } : {}),
        },
        body: body
          ? form
            ? new URLSearchParams(body as Record<string, string>).toString()
            : JSON.stringify(body)
          : undefined,
      })
    );
    return { status: response.status, data: await response.json() };
  };
  const client = await call("/oauth2/register", {
    client_name: "Remote Hermes",
    redirect_uris: ["http://localhost/callback"],
    token_endpoint_auth_method: "none",
    grant_types: [
      "urn:ietf:params:oauth:grant-type:device_code",
      "authorization_code",
      "refresh_token",
    ],
    scope: "openid offline_access organization:read",
  });
  expect(client.status, JSON.stringify(client.data)).toBe(201);
  const request = await call("/device/code", {
    client_id: client.data.client_id,
    resource,
    scope: "openid offline_access organization:read",
  });
  expect(request.status).toBe(200);
  return {
    db,
    call,
    clientId: client.data.client_id as string,
    code: request.data,
    auth,
    cookie,
  };
}

describe("OAuth agent device authorization", () => {
  it("requires explicit organization approval, issues OAuth tokens, and revokes refresh access", async () => {
    const { db, call, clientId, code, auth } = await fixture();
    expect(
      (await call("/agent/authorization", { userCode: code.user_code }, true))
        .status
    ).toBe(403);
    await call(`/device?user_code=${code.user_code}`, undefined, true);
    expect(
      (await call("/device/approve", { userCode: code.user_code }, true)).status
    ).toBe(403);
    const details = await call(
      "/agent/authorization",
      { userCode: code.user_code },
      true
    );
    expect(details.data.clientId).toBe(clientId);
    expect(details.data.organizations).toEqual([
      {
        id: "org-1",
        name: "Allowed",
      },
    ]);
    expect(
      (
        await call(
          "/agent/authorize",
          { userCode: code.user_code, organizationIds: ["other-org"] },
          true
        )
      ).status
    ).toBe(403);
    expect(
      (
        await call(
          "/agent/authorize",
          { userCode: code.user_code, organizationIds: ["org-1"] },
          true
        )
      ).status
    ).toBe(200);
    expect(
      (await call("/device/approve", { userCode: code.user_code }, true)).status
    ).toBe(200);
    const tokens = await call("/oauth2/token", {
      client_id: clientId,
      device_code: code.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    expect(tokens.status).toBe(200);
    expect(tokens.data.access_token).toBeString();
    expect(tokens.data.refresh_token).toBeString();
    expect(
      (
        await call("/device/token", {
          client_id: clientId,
          device_code: code.device_code,
        })
      ).status
    ).not.toBe(200);
    const refreshedBeforeRevoke = await call("/oauth2/token", {
      client_id: clientId,
      refresh_token: tokens.data.refresh_token,
      grant_type: "refresh_token",
      resource,
    });
    expect(
      refreshedBeforeRevoke.status,
      JSON.stringify(refreshedBeforeRevoke.data)
    ).toBe(200);
    const claims = JSON.parse(
      Buffer.from(
        tokens.data.access_token.split(".")[1],
        "base64url"
      ).toString()
    );
    const adapter = (await auth.$context).adapter;
    await expect(
      resolveAgentAuthorization(
        adapter,
        db.user![0]!.id as string,
        clientId,
        resource,
        ["organization:read"],
        claims.lunaris_grants
      )
    ).resolves.toMatchObject({ organizationIds: ["org-1"] });
    await expect(
      resolveAgentAuthorization(
        adapter,
        db.user![0]!.id as string,
        clientId,
        resource,
        ["organization:read"],
        {}
      )
    ).rejects.toThrow();
    const grants = await call("/agent/grants", undefined, true);
    expect(grants.data.grants).toHaveLength(1);
    expect(
      (await call("/agent/revoke", { id: grants.data.grants[0].id }, true))
        .status
    ).toBe(200);
    expect(db.agentAuthorization![0]!.revokedAt).toBeTruthy();
    await expect(
      resolveAgentAuthorization(
        (await auth.$context).adapter,
        db.user![0]!.id as string,
        clientId,
        resource,
        ["organization:read"],
        { [resource]: db.agentAuthorization![0]!.version }
      )
    ).rejects.toThrow("Reconnect");
    const refreshed = await call("/oauth2/token", {
      client_id: clientId,
      refresh_token: tokens.data.refresh_token,
      grant_type: "refresh_token",
    });
    expect(refreshed.status).not.toBe(200);
    expect(db.oauthRefreshToken).toHaveLength(0);
  });
  it("preserves signed browser PKCE consent and rejects tampered details", async () => {
    const { auth, cookie, clientId, call } = await fixture();
    const verifier = "a".repeat(64);
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: "http://localhost/callback",
      scope: "openid organization:read",
      resource,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: "browser-state",
    });
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth/oauth2/authorize?${query}`, {
        headers: { cookie },
      })
    );
    expect(response.status).toBe(302);
    const oauth_query = new URL(
      response.headers.get("location")!,
      "http://localhost:3000"
    ).search.slice(1);
    const details = await call("/agent/authorization", { oauth_query }, true);
    expect(details.status, JSON.stringify(details.data)).toBe(200);
    expect(details.data.clientId).toBe(clientId);
    expect(
      (
        await call(
          "/agent/authorization",
          {
            oauth_query: oauth_query.replace(
              "organization%3Aread",
              "organization%3Amanage"
            ),
          },
          true
        )
      ).status
    ).not.toBe(200);
    expect(
      (await call("/oauth2/consent", { accept: true, oauth_query }, true))
        .status
    ).toBe(403);
    expect(
      (
        await call(
          "/agent/authorize",
          { oauth_query, organizationIds: ["org-1"] },
          true
        )
      ).status
    ).toBe(200);
    const consent = await call(
      "/oauth2/consent",
      { accept: true, oauth_query },
      true
    );
    expect(consent.status, JSON.stringify(consent.data)).toBe(200);
    const code = new URL(
      consent.data.redirect_uri ?? consent.data.url
    ).searchParams.get("code");
    const tokens = await call("/oauth2/token", {
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: "http://localhost/callback",
      grant_type: "authorization_code",
      resource,
    });
    expect(tokens.status, JSON.stringify(tokens.data)).toBe(200);
  });
  it("honors pending, slow_down, wrong client, expiry, and denial", async () => {
    const { call, code, clientId, db } = await fixture();
    const poll = {
      client_id: clientId,
      device_code: code.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    };
    expect((await call("/oauth2/token", poll)).data.error).toBe(
      "authorization_pending"
    );
    expect((await call("/oauth2/token", poll)).data.error).toBe("slow_down");
    expect(
      (await call("/oauth2/token", { ...poll, client_id: "wrong-client" }))
        .status
    ).not.toBe(200);
    db.deviceCode![0]!.lastPolledAt = null;
    await call(`/device?user_code=${code.user_code}`, undefined, true);
    expect(
      (await call("/device/deny", { userCode: code.user_code }, true)).status
    ).toBe(200);
    expect((await call("/oauth2/token", poll)).data.error).toBe(
      "access_denied"
    );
    const expired = await call("/device/code", {
      client_id: clientId,
      resource,
      scope: "organization:read",
    });
    const expiredRecord = db.deviceCode!.find(
      (record) =>
        record.userCode ===
        expired.data.user_code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
    )!;
    expiredRecord.expiresAt = new Date(0);
    expect(
      (
        await call(
          `/device?user_code=${expired.data.user_code}`,
          undefined,
          true
        )
      ).status
    ).not.toBe(200);
    expect(
      (
        await call(
          "/agent/authorization",
          { userCode: expired.data.user_code },
          true
        )
      ).status
    ).not.toBe(200);
  });
  it("rejects unsigned browser authorization details", async () => {
    const { call, clientId } = await fixture();
    expect(
      (
        await call(
          "/agent/authorization",
          {
            oauth_query: `client_id=${clientId}&scope=organization:read&resource=${resource}`,
          },
          true
        )
      ).status
    ).not.toBe(200);
  });
});

it("does not let old tokens regain access when a client is authorized again", async () => {
  const { auth, call, code, clientId, db } = await fixture();
  await call(`/device?user_code=${code.user_code}`, undefined, true);
  await call(
    "/agent/authorize",
    { userCode: code.user_code, organizationIds: ["org-1"] },
    true
  );
  const originalVersion = db.agentAuthorization![0]!.version;
  const second = await call("/device/code", {
    client_id: clientId,
    resource,
    scope: "organization:read",
  });
  await call(`/device?user_code=${second.data.user_code}`, undefined, true);
  await call(
    "/agent/authorize",
    { userCode: second.data.user_code, organizationIds: ["org-1"] },
    true
  );
  expect(db.agentAuthorization![0]!.version).not.toBe(originalVersion);
  await expect(
    resolveAgentAuthorization(
      (await auth.$context).adapter,
      db.user![0]!.id as string,
      clientId,
      resource,
      ["organization:read"],
      { [resource]: originalVersion }
    )
  ).rejects.toThrow();
});

it("preserves explicit browser reauthentication", async () => {
  const { auth, cookie, clientId } = await fixture();
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: "http://localhost/callback",
    scope: "openid organization:read",
    resource,
    prompt: "login",
    code_challenge: createHash("sha256")
      .update("a".repeat(64))
      .digest("base64url"),
    code_challenge_method: "S256",
  });
  const response = await auth.handler(
    new Request(`http://localhost:3000/api/auth/oauth2/authorize?${query}`, {
      headers: { cookie },
    })
  );
  expect(response.status).toBe(302);
  expect(
    new URL(response.headers.get("location")!, "http://localhost:3000").pathname
  ).toBe("/login");
});
