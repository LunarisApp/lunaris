import { afterEach, describe, expect, it } from "bun:test";
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { cleanStores } from "nanostores";
import { BASE_PATH } from "./constants";
import { startupCachePlugin } from "./startup-cache";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const baseURL = "https://api.example.test";
const key = `lunaris:auth-startup:v1:${baseURL}`;
function session(userId = "alice", organizationId = "team") {
  return {
    user: { id: userId, emailVerified: true },
    session: {
      id: `session-${userId}`,
      userId,
      activeOrganizationId: organizationId,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  };
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function setup(
  options: { saved?: unknown; fetch?: typeof fetch; url?: string } = {}
) {
  const storage = memoryStorage();
  if (options.saved !== undefined) {
    storage.setItem(key, JSON.stringify(options.saved));
  }
  const client = createAuthClient({
    baseURL: options.url ?? baseURL,
    basePath: BASE_PATH,
    plugins: [
      organizationClient(),
      startupCachePlugin({ baseURL: options.url ?? baseURL, storage }),
    ],
    fetchOptions: {
      customFetchImpl:
        options.fetch ??
        ((async () => Response.json(null)) as unknown as typeof fetch),
    },
  });
  cleanups.push(() =>
    cleanStores(
      client.$store.atoms.session,
      client.$store.atoms.activeOrganization
    )
  );
  return { client, storage };
}
const saved = () => ({
  session: session(),
  organization: { id: "team", name: "Team" },
});

describe("auth startup cache", () => {
  it("restores a coherent snapshot before network completes and refreshes normally", async () => {
    let respond!: (value: Response) => void;
    const { client } = setup({
      saved: saved(),
      fetch: (() =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        })) as unknown as typeof fetch,
    });
    const atom = client.$store.atoms.session!;
    expect(atom.get().data?.user.id).toBe("alice");
    expect(atom.get().isPending).toBe(false);
    expect(atom.get().data?.session.expiresAt).toBeInstanceOf(Date);
    const refresh = atom.get().refetch();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(atom.get().data?.user.id).toBe("alice");
    expect(atom.get().isPending).toBe(false);
    respond(
      Response.json({ ...session(), user: { id: "alice", name: "Updated" } })
    );
    await refresh;
    expect(atom.get().data?.user.name).toBe("Updated");
  });

  it("rejects expired, mismatched, malformed and other-backend snapshots", () => {
    for (const value of [
      null,
      {},
      { ...saved(), organization: { id: "other" } },
      {
        ...saved(),
        session: {
          ...session(),
          session: { ...session().session, expiresAt: "2000-01-01" },
        },
      },
      { ...saved(), session: { ...session(), user: { id: "bob" } } },
    ]) {
      expect(
        setup({ saved: value }).client.$store.atoms.session!.get().data
      ).toBeNull();
    }
    expect(
      setup({
        saved: saved(),
        url: "https://other.test",
      }).client.$store.atoms.session!.get().data
    ).toBeNull();
  });

  it("saves session and organization together for the next launch", async () => {
    const { client, storage } = setup({
      fetch: (async (input: RequestInfo | URL) =>
        Response.json(
          String(input).includes("get-session") ? session() : { id: "team" }
        )) as unknown as typeof fetch,
    });
    await client.getSession();
    expect(storage.getItem(key)).toBeNull();
    await client.$fetch("/organization/get-full-organization");
    expect(JSON.parse(storage.getItem(key)!).session.user.id).toBe("alice");
  });

  it("keeps cached content on network failure but honors explicit session revocation", async () => {
    let offline = true;
    const { client, storage } = setup({
      saved: saved(),
      fetch: (async () => {
        if (offline) {
          throw new TypeError("Failed to fetch");
        }
        return Response.json(null);
      }) as unknown as typeof fetch,
    });
    await client.$store.atoms.session!.get().refetch();
    expect(client.$store.atoms.session!.get().data?.user.id).toBe("alice");
    offline = false;
    await client.$store.atoms
      .session!.get()
      .refetch({ query: { disableCookieCache: true } });
    expect(client.$store.atoms.session!.get().data).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("clears snapshots before sign-out and prevents in-flight reads from restoring them", async () => {
    let respond!: (value: Response) => void;
    const { client, storage } = setup({
      saved: saved(),
      fetch: ((input: RequestInfo | URL) => {
        if (String(input).includes("get-session")) {
          return new Promise<Response>((resolve) => {
            respond = resolve;
          });
        }
        return Promise.resolve(Response.json({ success: true }));
      }) as unknown as typeof fetch,
    });
    const read = client.getSession();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await client.signOut();
    expect(storage.getItem(key)).toBeNull();
    respond(Response.json(session()));
    await read.catch(() => undefined);
    expect(storage.getItem(key)).toBeNull();
  });

  it("clears on account and organization switching", async () => {
    for (const path of [
      "/multi-session/set-active",
      "/organization/set-active",
    ]) {
      const { client, storage } = setup({ saved: saved() });
      await client.$fetch(path, { method: "POST", body: {} });
      expect(storage.getItem(key)).toBeNull();
    }
  });
  it("does not cache organization queries for another organization", async () => {
    const { client, storage } = setup({
      saved: saved(),
      fetch: (async () =>
        Response.json({ id: "other" })) as unknown as typeof fetch,
    });
    await client.$fetch("/organization/get-full-organization", {
      query: { organizationId: "other" },
    });
    expect(JSON.parse(storage.getItem(key)!).organization.id).toBe("team");
  });

  it("clears visible cached state after forbidden organization access", async () => {
    const { client, storage } = setup({
      saved: saved(),
      fetch: (async () =>
        Response.json(
          { message: "Forbidden" },
          { status: 403 }
        )) as unknown as typeof fetch,
    });
    await client.$store.atoms.activeOrganization!.get().refetch();
    expect(client.$store.atoms.activeOrganization!.get().data).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("rejects aborted requests instead of masking cancellation with cached success", async () => {
    const { client } = setup({
      saved: saved(),
      fetch: (async () => {
        throw new DOMException("Aborted", "AbortError");
      }) as unknown as typeof fetch,
    });
    const result = await client.getSession().catch((error: unknown) => error);
    expect(result).toBeInstanceOf(DOMException);
  });

  it("allows session resolution when an empty organization response arrives first", async () => {
    let respond!: (value: Response) => void;
    const { client } = setup({
      fetch: ((input: RequestInfo | URL) => {
        if (String(input).includes("get-session")) {
          return new Promise<Response>((resolve) => {
            respond = resolve;
          });
        }
        return Promise.resolve(Response.json(null));
      }) as unknown as typeof fetch,
    });
    const read = client.getSession();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await client.$fetch("/organization/get-full-organization");
    respond(Response.json(session()));
    expect((await read).data?.user.id).toBe("alice");
  });

  it("continues using the network when browser storage is blocked", async () => {
    const storage = {
      getItem() {
        throw new Error("Blocked");
      },
      setItem() {
        throw new Error("Blocked");
      },
      removeItem() {
        throw new Error("Blocked");
      },
    };
    const client = createAuthClient({
      baseURL,
      basePath: BASE_PATH,
      plugins: [organizationClient(), startupCachePlugin({ baseURL, storage })],
      fetchOptions: {
        customFetchImpl: (async () =>
          Response.json(session())) as unknown as typeof fetch,
      },
    });
    expect((await client.getSession()).data?.user.id).toBe("alice");
  });

  it("does not restore snapshots while an account mutation is still running", async () => {
    let finish!: (response: Response) => void;
    const { client, storage } = setup({
      saved: saved(),
      fetch: (() =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })) as unknown as typeof fetch,
    });
    const mutation = client.signOut();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const read = await client.getSession().catch((error: unknown) => error);
    expect(read).toBeInstanceOf(DOMException);
    expect(storage.getItem(key)).toBeNull();
    finish(Response.json({ success: true }));
    await mutation;
    expect(storage.getItem(key)).toBeNull();
  });

  it("drops hydrated account state when another tab clears its snapshot", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    const events = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: events,
    });
    const { client } = setup({ saved: saved() });
    try {
      const event = Object.assign(new Event("storage"), {
        key,
        newValue: null,
      });
      events.dispatchEvent(event);
      expect(client.$store.atoms.session!.get().data).toBeNull();
      expect(client.$store.atoms.activeOrganization!.get().data).toBeNull();
    } finally {
      // Let invalidation refetches settle before disposing browser listeners.
      await new Promise((resolve) => setTimeout(resolve, 0));
      cleanStores(
        client.$store.atoms.session,
        client.$store.atoms.activeOrganization
      );
      if (original) {
        Object.defineProperty(globalThis, "window", original);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
  it("keeps a coherent snapshot after Better Auth renews a session via POST", async () => {
    const { client, storage } = setup({
      saved: saved(),
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) =>
        Response.json(
          init?.method === "POST"
            ? session()
            : { ...session(), needsRefresh: true }
        )) as unknown as typeof fetch,
    });
    await client.$store.atoms.session!.get().refetch();
    expect(JSON.parse(storage.getItem(key)!).session.user.id).toBe("alice");
    expect(client.$store.atoms.activeOrganization!.get().data?.id).toBe("team");
  });

  it("rejects reads invalidated in another tab even before storage events arrive", async () => {
    let finish!: (response: Response) => void;
    const { client, storage } = setup({
      saved: saved(),
      fetch: (() =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })) as unknown as typeof fetch,
    });
    const read = client.getSession();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const other = createAuthClient({
      baseURL,
      basePath: BASE_PATH,
      plugins: [organizationClient(), startupCachePlugin({ baseURL, storage })],
      fetchOptions: {
        customFetchImpl: (async () =>
          Response.json({ success: true })) as unknown as typeof fetch,
      },
    });
    await other.signOut();
    finish(Response.json(session()));
    const result = await read.catch((error: unknown) => error);
    expect(result).toBeInstanceOf(DOMException);
    expect(storage.getItem(key)).toBeNull();
  });

  it("does not persist a cancelled refetch that resolves after a newer one", async () => {
    const responses: Array<(response: Response) => void> = [];
    const { client, storage } = setup({
      saved: saved(),
      fetch: (() =>
        new Promise<Response>((resolve) => {
          responses.push(resolve);
        })) as unknown as typeof fetch,
    });
    const old = client.$store.atoms.session!.get().refetch();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const current = client.$store.atoms.session!.get().refetch();
    await new Promise((resolve) => setTimeout(resolve, 0));
    responses[1]!(
      Response.json({ ...session(), user: { id: "alice", name: "Current" } })
    );
    await current;
    responses[0]!(
      Response.json({ ...session(), user: { id: "alice", name: "Old" } })
    );
    await old;
    expect(JSON.parse(storage.getItem(key)!).session.user.name).toBe("Current");
  });
});
