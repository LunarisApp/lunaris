import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { adoptAnonymousOrganizationOnLink } from "./anonymous-account-link";
import {
  LAST_LOGIN_METHOD_COOKIE_NAME,
  LAST_LOGIN_METHOD_MAX_AGE,
} from "./constants";
import {
  assertCanAcceptOrganizationInvitation,
  assertCanAddOrganizationRole,
  assertCanRemoveOrganizationMember,
  assertCanUpdateOrganizationRole,
  assertOrganizationTypeImmutable,
  buildAgentApiKeyOptions,
  buildAuthServerOptions,
  buildInvitationLink,
  buildPasskeyConfig,
  createAuth,
  createLastLoginMethodPlugin,
  syncOrganizationMemberSeats,
} from "./server";

describe("buildAuthServerOptions", () => {
  it("pins OAuth verification to the configured auth server", () => {
    expect(buildAuthServerOptions("https://api.lunaris.app/")).toEqual({
      baseURL: "https://api.lunaris.app",
      jwt: { jwt: { issuer: "https://api.lunaris.app/auth" } },
    });
  });

  it("keeps sessions in the database for OAuth provider compatibility", () => {
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
    });

    expect(auth.options.session?.storeSessionInDatabase).toBe(true);
    expect(auth.options.session?.cookieCache).toMatchObject({
      enabled: true,
      maxAge: 60 * 60 * 3,
    });
  });

  it("enables multi-session account switching", () => {
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
    });

    expect(auth.options.plugins?.some((plugin) => plugin.id === "multi-session"))
      .toBe(true);
  });

  it("omits organization team endpoints without the enterprise opt-in", () => {
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
    });

    const organizationPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "organization",
    );

    expect(organizationPlugin?.endpoints).not.toHaveProperty("createTeam");
    expect(organizationPlugin?.endpoints).not.toHaveProperty(
      "listOrganizationTeams",
    );
    expect(organizationPlugin?.endpoints).not.toHaveProperty("addTeamMember");
  });

  it("schedules a plain-text welcome email five minutes after verification", async () => {
    const send = mock((_email: unknown, _options?: unknown) =>
      Promise.resolve({ data: { id: "email-1" }, error: null })
    );
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
      resend: { emails: { send } } as never,
    });

    const verifiedAt = Date.now();
    await auth.options.emailVerification?.afterEmailVerification?.({
      createdAt: new Date(),
      email: "reader@example.com",
      emailVerified: true,
      id: "user-1",
      image: null,
      name: "Ada",
      updatedAt: new Date(),
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [emailInput, options] = send.mock.calls[0]!;
    const email = emailInput as Record<string, unknown>;
    expect(email).toEqual({
      from: "Lunaris <noreply@mail.lunaris.app>",
      replyTo: "Roman <roman@lunaris.app>",
      scheduledAt: expect.any(String),
      subject: "Welcome to Lunaris",
      text: [
        "Hi Ada,",
        "",
        "I'm Roman, the founder of Lunaris. Just saw you signed up.",
        "",
        "What brought you here, and what are you hoping to use Lunaris for? Just reply to this email — I read every response.",
        "",
        "Roman",
      ].join("\n"),
      to: "reader@example.com",
    });
    expect(options).toEqual({ idempotencyKey: "welcome-user/user-1" });
    const scheduledAt = new Date(email.scheduledAt as string).getTime();
    expect(scheduledAt).toBeGreaterThanOrEqual(verifiedAt + 5 * 60 * 1000);
    expect(scheduledAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
  });

  it("does not schedule welcome email before verification", async () => {
    const send = mock((_email: unknown, _options?: unknown) =>
      Promise.resolve({ data: { id: "email-1" }, error: null })
    );
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
      resend: { emails: { send } } as never,
    });

    await auth.options.databaseHooks?.user?.create?.after?.(
      {
        createdAt: new Date(),
        email: "reader@example.com",
        emailVerified: false,
        id: "user-1",
        image: null,
        isAnonymous: false,
        name: "Ada",
        updatedAt: new Date(),
      },
      null,
    );

    expect(send).not.toHaveBeenCalled();
  });

  it("schedules welcome email when provider creates a verified user", async () => {
    const send = mock((_email: unknown, _options?: unknown) =>
      Promise.resolve({ data: { id: "email-1" }, error: null })
    );
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
      resend: { emails: { send } } as never,
    });

    await auth.options.databaseHooks?.user?.create?.after?.(
      {
        createdAt: new Date(),
        email: "reader@example.com",
        emailVerified: true,
        id: "user-1",
        image: null,
        isAnonymous: false,
        name: "Ada",
        updatedAt: new Date(),
      },
      null,
    );

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send welcome email to anonymous users", async () => {
    const send = mock((_email: unknown, _options?: unknown) =>
      Promise.resolve({ data: { id: "email-1" }, error: null })
    );
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
      resend: { emails: { send } } as never,
    });

    await auth.options.databaseHooks?.user?.create?.after?.(
      {
        createdAt: new Date(),
        email: "guest@anon.lunaris.app",
        emailVerified: true,
        id: "guest-1",
        image: null,
        isAnonymous: true,
        name: "Guest",
        updatedAt: new Date(),
      },
      null,
    );

    expect(send).not.toHaveBeenCalled();
  });

  it("does not fail verification when welcome email scheduling fails", async () => {
    const send = mock((_email: unknown, _options?: unknown) =>
      Promise.resolve({
        data: null,
        error: { message: "Provider unavailable", name: "application_error" },
      })
    );
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
      resend: { emails: { send } } as never,
    });

    await expect(
      auth.options.emailVerification?.afterEmailVerification?.({
        createdAt: new Date(),
        email: "reader@example.com",
        emailVerified: true,
        id: "user-1",
        image: null,
        name: "Ada",
        updatedAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("buildAgentApiKeyOptions", () => {
  it("keeps agent credentials scoped with correct expiry units", () => {
    const options = buildAgentApiKeyOptions();

    expect(options.enableSessionForAPIKeys).toBe(false);
    expect(options.keyExpiration).toEqual({
      defaultExpiresIn: 90 * 24 * 60 * 60,
      maxExpiresIn: 365,
      minExpiresIn: 1,
    });
    expect(
      options.permissions.defaultPermissions("user-1", {
        body: {
          metadata: {
            scopes: ["workspace:write"],
            organizationIds: ["organization-1"],
          },
        },
      }),
    ).toEqual({ agent: ["workspace:write"] });
    expect(() =>
      options.permissions.defaultPermissions("user-1", {
        body: { metadata: { organizationIds: ["organization-1"] } },
      }),
    ).toThrow("organization allowlist");
  });
});

function makeLogger() {
  return {
    info: mock(() => undefined),
    warn: mock(() => undefined),
  };
}

describe("adoptAnonymousOrganizationOnLink", () => {
  const guestOrg = { id: "org-guest" };
  const claimedOrg = { id: "org-claimed" };
  let createMember: ReturnType<typeof mock>;
  let deleteOrganization: ReturnType<typeof mock>;
  let findMemberByOrgId: ReturnType<typeof mock>;
  let listMembers: ReturnType<typeof mock>;
  let listOrganizations: ReturnType<typeof mock>;
  let listSessions: ReturnType<typeof mock>;
  let updateSession: ReturnType<typeof mock>;

  beforeEach(() => {
    createMember = mock(() => Promise.resolve(undefined));
    deleteOrganization = mock(() => Promise.resolve(undefined));
    findMemberByOrgId = mock(() => Promise.resolve(null));
    listMembers = mock(() =>
      Promise.resolve({
        members: [{ user: { id: "claimed-user" } }],
        total: 1,
      })
    );
    listOrganizations = mock((userId: string) =>
      Promise.resolve(userId === "anon-user" ? [guestOrg] : [claimedOrg])
    );
    listSessions = mock(() =>
      Promise.resolve([{ token: "sess-1" }, { token: "sess-2" }])
    );
    updateSession = mock(() => Promise.resolve(undefined));
  });

  it("adopts the guest organization and deletes the disposable claimed organization", async () => {
    const logger = makeLogger();

    await adoptAnonymousOrganizationOnLink({
      adapter: {
        createMember,
        deleteOrganization,
        findMemberByOrgId,
        listMembers,
        listOrganizations,
      },
      internalAdapter: {
        listSessions,
        updateSession,
      },
      anonymousUserId: "anon-user",
      claimedUserId: "claimed-user",
      log: logger as any,
    });

    expect(createMember).toHaveBeenCalledWith({
      organizationId: guestOrg.id,
      userId: "claimed-user",
      role: "owner",
      createdAt: expect.any(Date),
    });
    expect(updateSession).toHaveBeenCalledTimes(2);
    expect(updateSession).toHaveBeenCalledWith("sess-1", {
      activeOrganizationId: guestOrg.id,
    });
    expect(deleteOrganization).toHaveBeenCalledWith(claimedOrg.id);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("keeps the claimed organization when it is not disposable", async () => {
    const logger = makeLogger();
    listMembers.mockImplementation(() =>
      Promise.resolve({
        members: [{ user: { id: "claimed-user" } }, { user: { id: "other" } }],
        total: 2,
      })
    );

    await adoptAnonymousOrganizationOnLink({
      adapter: {
        createMember,
        deleteOrganization,
        findMemberByOrgId,
        listMembers,
        listOrganizations,
      },
      internalAdapter: {
        listSessions,
        updateSession,
      },
      anonymousUserId: "anon-user",
      claimedUserId: "claimed-user",
      log: logger as any,
    });

    expect(deleteOrganization).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("does not create duplicate membership when the claimed user already belongs to the guest organization", async () => {
    findMemberByOrgId.mockImplementation(() => Promise.resolve({ id: "member-1" }));

    await adoptAnonymousOrganizationOnLink({
      adapter: {
        createMember,
        deleteOrganization,
        findMemberByOrgId,
        listMembers,
        listOrganizations,
      },
      internalAdapter: {
        listSessions,
        updateSession,
      },
      anonymousUserId: "anon-user",
      claimedUserId: "claimed-user",
    });

    expect(createMember).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledTimes(2);
  });

  it("throws when the anonymous user has no guest organization", async () => {
    listOrganizations.mockImplementation((userId: string) =>
      Promise.resolve(userId === "anon-user" ? [] : [claimedOrg])
    );
    const logger = makeLogger();

    await expect(
      adoptAnonymousOrganizationOnLink({
        adapter: {
          createMember,
          deleteOrganization,
          findMemberByOrgId,
          listMembers,
          listOrganizations,
        },
        internalAdapter: {
          listSessions,
          updateSession,
        },
        anonymousUserId: "anon-user",
        claimedUserId: "claimed-user",
        log: logger as any,
      })
    ).rejects.toThrow("Anonymous account has no organization to adopt");

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(createMember).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe("buildInvitationLink", () => {
  it("builds accept-invitation url with invitation id", () => {
    expect(
      buildInvitationLink("https://app.lunaris.app", "invite_123")
    ).toBe(
      "https://app.lunaris.app/auth/accept-invitation?invitationId=invite_123"
    );
  });
});

describe("buildPasskeyConfig", () => {
  it("uses the configured frontend origin and hostname", () => {
    expect(buildPasskeyConfig("https://app.lunaris.app/path")).toEqual({
      origin: "https://app.lunaris.app",
      rpID: "app.lunaris.app",
      rpName: "Lunaris",
    });
  });

  it("supports local development origins", () => {
    expect(buildPasskeyConfig("http://localhost:5173")).toEqual({
      origin: "http://localhost:5173",
      rpID: "localhost",
      rpName: "Lunaris",
    });
  });
});

describe("createLastLoginMethodPlugin", () => {
  it("uses cookie-only 30-day persistence", () => {
    const plugin = createLastLoginMethodPlugin();

    expect(plugin.options).toEqual({
      cookieName: LAST_LOGIN_METHOD_COOKIE_NAME,
      maxAge: LAST_LOGIN_METHOD_MAX_AGE,
      storeInDatabase: false,
    });
    expect(plugin.schema).toBeUndefined();
  });
});

describe("assertCanAcceptOrganizationInvitation", () => {
  it("blocks acceptance when organization has no member capacity", async () => {
    await expect(
      assertCanAcceptOrganizationInvitation({
        organization: { id: "org-1", isPersonal: false },
        organizationPlans: {
          canCreateOwnedOrganization: mock(() => Promise.resolve(true)),
          canManageBilling: mock(() => Promise.resolve(true)),
          getMemberLimit: mock(() => Promise.resolve(3)),
          hasMemberCapacity: mock(() => Promise.resolve(false)),
          hasMembers: mock(() => Promise.resolve(true)),
          syncMemberSeats: mock(() => Promise.resolve()),
        },
      })
    ).rejects.toThrow("Organization member limit reached.");
  });

  it("allows acceptance when organization has capacity", async () => {
    await expect(
      assertCanAcceptOrganizationInvitation({
        organization: { id: "org-1", isPersonal: false },
        organizationPlans: {
          canCreateOwnedOrganization: mock(() => Promise.resolve(true)),
          canManageBilling: mock(() => Promise.resolve(true)),
          getMemberLimit: mock(() => Promise.resolve(3)),
          hasMemberCapacity: mock(() => Promise.resolve(true)),
          hasMembers: mock(() => Promise.resolve(true)),
          syncMemberSeats: mock(() => Promise.resolve()),
        },
      })
    ).resolves.toBeUndefined();
  });

  it("checks accepted members, excluding other pending invitations", async () => {
    const hasMemberCapacity = mock(() => Promise.resolve(true));

    await assertCanAcceptOrganizationInvitation({
      organization: { id: "org-1", isPersonal: false },
      organizationPlans: {
        canCreateOwnedOrganization: mock(() => Promise.resolve(true)),
        canManageBilling: mock(() => Promise.resolve(true)),
        getMemberLimit: mock(() => Promise.resolve(3)),
        hasMemberCapacity,
        hasMembers: mock(() => Promise.resolve(true)),
        syncMemberSeats: mock(() => Promise.resolve()),
      },
    });

    expect(hasMemberCapacity).toHaveBeenCalledWith("org-1", {
      includePendingInvitations: false,
    });
  });
});

describe("syncOrganizationMemberSeats", () => {
  it("defers failed provider updates without failing committed membership changes", async () => {
    const syncMemberSeats = mock(() =>
      Promise.reject(new Error("Polar unavailable")),
    );

    await expect(
      syncOrganizationMemberSeats({ syncMemberSeats }, "org-1"),
    ).resolves.toBeUndefined();
    expect(syncMemberSeats).toHaveBeenCalledWith("org-1");
  });
});

describe("organization invariants", () => {
  it("keeps personal organization identity immutable", () => {
    expect(() => assertOrganizationTypeImmutable({ isPersonal: false })).toThrow(
      "Organization type cannot be changed.",
    );
    expect(() => assertOrganizationTypeImmutable({ name: "Renamed" })).not.toThrow();
  });

  it("allows only the initial organization owner", () => {
    expect(() => assertCanAddOrganizationRole("owner", false)).not.toThrow();
    expect(() => assertCanAddOrganizationRole("owner,editor", false)).toThrow(
      "Organization role must be owner, editor, or viewer.",
    );
    expect(() => assertCanAddOrganizationRole("owner", true)).toThrow(
      "Organization owner role cannot be added.",
    );
    expect(() => assertCanAddOrganizationRole("owner,editor", true)).toThrow(
      "Organization role must be owner, editor, or viewer.",
    );
    expect(() => assertCanAddOrganizationRole("editor", true)).not.toThrow();
    expect(() => assertCanAddOrganizationRole("viewer", true)).not.toThrow();
    expect(() => assertCanAddOrganizationRole("member", true)).toThrow(
      "Organization role must be owner, editor, or viewer.",
    );
  });

  it("rejects promoting another member to owner", () => {
    expect(() => assertCanUpdateOrganizationRole("viewer", "owner")).toThrow(
      "Organization owner role cannot be added.",
    );
    expect(() => assertCanUpdateOrganizationRole("owner", "owner")).not.toThrow();
    expect(() => assertCanUpdateOrganizationRole("owner", "editor")).toThrow(
      "Organization owner role cannot be added.",
    );
    expect(() => assertCanUpdateOrganizationRole("owner", "owner,editor")).toThrow(
      "Organization role must be owner, editor, or viewer.",
    );
    expect(() =>
      assertCanUpdateOrganizationRole("editor", "viewer"),
    ).not.toThrow();
    expect(() => assertCanUpdateOrganizationRole("viewer", "admin")).toThrow(
      "Organization role must be owner, editor, or viewer.",
    );
  });

  it("prevents removing the stable owner", () => {
    expect(() => assertCanRemoveOrganizationMember("owner")).toThrow(
      "Organization owner cannot be removed.",
    );
    expect(() => assertCanRemoveOrganizationMember("viewer")).not.toThrow();
  });
});


describe("self-hosted cookie options", () => {
  it("uses host-only secure cookies on HTTPS", async () => {
    const { buildSelfHostedCookieOptions } = await import("./server");
    const options = buildSelfHostedCookieOptions("https://notes.example.com");
    expect(options.crossSubDomainCookies.enabled).toBe(false);
    expect(options.useSecureCookies).toBe(true);
    expect(options.defaultCookieAttributes.sameSite).toBe("lax");
  });
  it("allows localhost HTTP cookies", async () => {
    const { buildSelfHostedCookieOptions } = await import("./server");
    expect(buildSelfHostedCookieOptions("http://localhost:8080").useSecureCookies).toBe(false);
  });
});


describe("signup policy", () => {
  const user = {
    id: "new-user", name: "New user", email: "new@example.com",
    emailVerified: false, createdAt: new Date(), updatedAt: new Date(),
  };
  it("blocks user creation even without request context or with verification disabled", async () => {
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app", signupsAllowed: false,
      disableEmailVerification: true,
      socialProviders: { google: { clientId: "client", clientSecret: "secret" } },
    });
    for (const isAnonymous of [false, true]) {
      await expect(auth.options.databaseHooks!.user!.create!.before!(
        { ...user, isAnonymous }, null,
      )).rejects.toMatchObject({ status: "FORBIDDEN", body: { code: "SIGNUP_DISABLED" } });
    }
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
    expect(auth.options.socialProviders?.google).toMatchObject({ disableSignUp: true });
  });
  it("allows creation by default and when explicitly enabled", async () => {
    for (const signupsAllowed of [undefined, true]) {
      const auth = createAuth({} as never, {
        frontendUrl: "https://app.lunaris.app", signupsAllowed,
      });
      await expect(auth.options.databaseHooks!.user!.create!.before!(user, null)).resolves.toBeUndefined();
      expect(auth.options.emailAndPassword?.disableSignUp).toBe(false);
    }
  });
});

describe("password recovery policy", () => {
  it("revokes sessions after resetting passwords", () => {
    const auth = createAuth({} as never, { frontendUrl: "http://localhost:8080", backendUrl: "http://localhost:8080", database: memoryAdapter({ oauthResource: [], user: [], account: [], session: [], verification: [] }) });
    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });
  it("disables cookie caching on self-hosted servers", () => {
    const previous = process.env.DEPLOYMENT_MODE;
    try {
      process.env.DEPLOYMENT_MODE = "self-hosted";
      const auth = createAuth({} as never, { frontendUrl: "http://localhost:8080", backendUrl: "http://localhost:8080", database: memoryAdapter({ oauthResource: [], user: [], account: [], session: [], verification: [] }) });
      expect(auth.options.session?.cookieCache?.enabled).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.DEPLOYMENT_MODE;
      else process.env.DEPLOYMENT_MODE = previous;
    }
  });
  it("surfaces mail provider rejection", async () => {
    const auth = createAuth({} as never, {
      frontendUrl: "http://localhost:8080",
      resend: { emails: { send: async () => ({ error: { message: "rejected" } }) } } as never,
    });
    await expect(auth.options.emailAndPassword!.sendResetPassword!({
      user: { email: "person@example.com", name: "Person" } as never,
      url: "https://example.com/reset", token: "unused",
    })).rejects.toThrow("Email delivery failed");
  });
});


describe("self-hosted mail", () => {
  it("uses the configured sender for password recovery and skips founder welcome emails", async () => {
    const previous = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = "self-hosted";
    try {
      const send = mock((_email: unknown) => Promise.resolve({ data: { id: "email-1" }, error: null }));
      const auth = createAuth({} as never, {
        database: memoryAdapter({ oauthResource: [], user: [], account: [], session: [], verification: [] }),
        frontendUrl: "https://notes.example.com",
        backendUrl: "https://notes.example.com",
        emailFrom: "Notes <notes@example.com>",
        emailReplyTo: "admin@example.com",
        resend: { emails: { send } } as never,
      });
      const user = { id: "user-1", name: "Ada", email: "ada@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() };
      await auth.options.emailAndPassword?.sendResetPassword?.({ user, url: "https://notes.example.com/reset", token: "test-token" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toMatchObject({ from: "Notes <notes@example.com>", replyTo: "admin@example.com" });
      await auth.options.emailVerification?.afterEmailVerification?.(user);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.DEPLOYMENT_MODE;
      else process.env.DEPLOYMENT_MODE = previous;
    }
  });
});
