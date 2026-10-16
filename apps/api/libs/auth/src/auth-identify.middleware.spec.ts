import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockEvlogLogger } from "../../../test/preload";

const loggerSet = mockEvlogLogger.set;

const { AuthIdentifyMiddleware } = await import("./auth-identify.middleware");

function createMiddleware(session: unknown) {
  const getSession = mock(() => Promise.resolve(session));
  const middleware = new AuthIdentifyMiddleware({
    instance: { api: { getSession } },
  } as never);
  return { getSession, middleware };
}

describe("AuthIdentifyMiddleware", () => {
  beforeEach(() => {
    loggerSet.mockReset();
  });

  it("adds safe Better Auth identity to the request wide event", async () => {
    const { getSession, middleware } = createMiddleware({
      user: {
        id: "user_1",
        name: "Ada",
        email: "ada@example.com",
        emailVerified: true,
      },
      session: {
        activeOrganizationId: "org_1",
        id: "session_1",
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const next = mock(() => undefined);

    await middleware.use(
      {
        headers: { cookie: "session=secret" },
        url: "/v1/workspaces?limit=10",
      } as never,
      {} as never,
      next
    );

    expect(getSession).toHaveBeenCalledTimes(1);
    const headers = (
      getSession.mock.calls as unknown as [{ headers: Headers }][]
    )[0]?.[0].headers;
    expect(headers.get("cookie")).toBe("session=secret");
    expect(loggerSet).toHaveBeenNthCalledWith(1, {
      userId: "user_1",
      user: {
        id: "user_1",
      },
      organization: {
        id: "org_1",
      },
    });
    expect(loggerSet).toHaveBeenNthCalledWith(2, {
      auth: {
        resolvedIn: expect.any(Number),
        identified: true,
      },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("skips Better Auth and public infrastructure routes", async () => {
    const { getSession, middleware } = createMiddleware(null);
    const next = mock(() => undefined);

    for (const url of [
      "/api/auth/sign-in/email",
      "/api",
      "/api-json",
      "/v1/health",
      "/v1/manifest",
    ]) {
      await middleware.use({ headers: {}, url } as never, {} as never, next);
    }

    expect(getSession).not.toHaveBeenCalled();
    expect(loggerSet).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(5);
  });
});
