import type { BetterAuthClientPlugin } from "better-auth/client";
import { z } from "zod";
import { BASE_PATH } from "./constants";

const sessionSchema = z
  .object({
    user: z.object({ id: z.string().min(1) }).passthrough(),
    session: z
      .object({
        id: z.string().min(1),
        userId: z.string().min(1),
        activeOrganizationId: z.string().min(1),
        expiresAt: z.coerce.date(),
      })
      .passthrough(),
  })
  .passthrough();
const organizationSchema = z.object({ id: z.string().min(1) }).passthrough();
const snapshotSchema = z.object({
  session: sessionSchema,
  organization: organizationSchema,
});
type Snapshot = z.infer<typeof snapshotSchema>;
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function validSnapshot(value: unknown): Snapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const snapshot = parsed.data;
  return snapshot.session.session.expiresAt.getTime() > Date.now() &&
    snapshot.session.user.id === snapshot.session.session.userId &&
    snapshot.organization.id === snapshot.session.session.activeOrganizationId
    ? snapshot
    : null;
}

// Match Better Auth's date handling when restoring JSON into its query atoms.
function parseSnapshot(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (typeof value === "string" && /At$/.test(key)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  });
}

/** Restore one coherent account snapshot; normal Better Auth queries revalidate it. */
export function startupCachePlugin({
  baseURL,
  storage: providedStorage,
}: {
  baseURL: string;
  storage?: CacheStorage;
}): BetterAuthClientPlugin {
  const key = `lunaris:auth-startup:v1:${baseURL.replace(/\/$/, "")}`;
  const revisionKey = `${key}:revision`;
  const authURL = new URL(`${BASE_PATH.replace(/\/$/, "")}/`, baseURL);
  let generation = 0;
  let mutationsInFlight = 0;
  let snapshot: Snapshot | null = null;
  let pendingSession: Snapshot["session"] | null = null;
  let pendingOrganization: Snapshot["organization"] | null = null;
  let resetAtoms = () => {
    /* No action while this capability is unavailable. */
  };
  let clearView = (_session: boolean) => {
    /* No action while this capability is unavailable. */
  };

  const storage = () =>
    providedStorage ??
    (typeof window === "undefined" ? undefined : window.localStorage);
  const readRevision = () => {
    try {
      return storage()?.getItem(revisionKey) ?? null;
    } catch {
      return null;
    }
  };
  const clear = (broadcast = false) => {
    generation++;
    snapshot = null;
    pendingSession = null;
    pendingOrganization = null;
    try {
      storage()?.removeItem(key);
      // Removal alone emits no event when the snapshot is already absent.
      if (broadcast) {
        storage()?.setItem(revisionKey, crypto.randomUUID());
      }
    } catch {
      /* Storage may be disabled. */
    }
  };
  const save = () => {
    snapshot = validSnapshot({
      session: pendingSession,
      organization: pendingOrganization,
    });
    try {
      if (snapshot) {
        storage()?.setItem(key, JSON.stringify(snapshot));
      } else {
        storage()?.removeItem(key);
      }
    } catch {
      /* Cache is optional. */
    }
  };

  return {
    id: "lunaris-auth-startup-cache",
    getActions(_fetch, store) {
      try {
        const saved = storage()?.getItem(key);
        snapshot = saved ? validSnapshot(parseSnapshot(saved)) : null;
      } catch {
        snapshot = null;
      }
      pendingSession = snapshot?.session ?? null;
      pendingOrganization = snapshot?.organization ?? null;
      const sessionAtom = store.atoms.session;
      const organizationAtom = store.atoms.activeOrganization;
      if (snapshot && sessionAtom && organizationAtom) {
        sessionAtom.set({
          ...sessionAtom.get(),
          data: snapshot.session,
          isPending: false,
        });
        organizationAtom.set({
          ...organizationAtom.get(),
          data: snapshot.organization,
          isPending: false,
        });
      }
      clearView = (includeSession) => {
        for (const atom of includeSession
          ? [sessionAtom, organizationAtom]
          : [organizationAtom]) {
          if (atom) {
            atom.set({ ...atom.get(), data: null, isPending: false });
          }
        }
      };
      resetAtoms = () => {
        for (const atom of [sessionAtom, organizationAtom]) {
          if (atom) {
            atom.set({ ...atom.get(), data: null, isPending: true });
          }
        }
        store.notify("$sessionSignal");
        store.notify("$activeOrgSignal");
      };
      if (typeof window !== "undefined") {
        window.addEventListener("storage", (event) => {
          // Another tab changed auth context. Never keep showing its old account.
          if (
            event.key === revisionKey ||
            (event.key === key && event.newValue === null) ||
            event.key === null
          ) {
            generation++;
            snapshot = null;
            pendingSession = null;
            pendingOrganization = null;
            resetAtoms();
          }
        });
      }
      return { clearCache: () => clear(true) };
    },
    fetchPlugins: [
      {
        id: "lunaris-auth-startup-cache",
        name: "lunaris-auth-startup-cache",
        init(url, options) {
          // Better Auth also supplies native fetch as customFetchImpl.
          const sourceFetch = options?.customFetchImpl ?? globalThis.fetch;
          const originalFetch =
            sourceFetch === globalThis.fetch
              ? sourceFetch.bind(globalThis)
              : sourceFetch;
          const wrappedFetch = async (
            input: RequestInfo | URL,
            init?: RequestInit
          ): Promise<Response> => {
            const requestURL = new URL(
              input instanceof Request ? input.url : String(input),
              authURL
            );
            if (
              requestURL.origin !== authURL.origin ||
              !requestURL.pathname.startsWith(authURL.pathname)
            ) {
              return originalFetch(input, init);
            }
            const path = requestURL.pathname.slice(authURL.pathname.length);
            const method = (
              init?.method ?? (input instanceof Request ? input.method : "GET")
            ).toUpperCase();
            const sessionRefresh = path === "get-session" && method === "POST";
            const mutation =
              method !== "GET" && method !== "HEAD" && !sessionRefresh;
            if (mutation) {
              clear(true);
              mutationsInFlight++;
              try {
                return await originalFetch(input, init);
              } finally {
                mutationsInFlight--;
                clear(true);
              }
            }
            const requestSignal =
              init?.signal ??
              (input instanceof Request ? input.signal : undefined);
            const currentGeneration = generation;
            const currentRevision = readRevision();
            const isCurrent = () =>
              !requestSignal?.aborted &&
              currentGeneration === generation &&
              currentRevision === readRevision();
            const tracked =
              (method === "GET" || sessionRefresh) &&
              (path === "get-session" ||
                (path === "organization/get-full-organization" &&
                  requestURL.search === ""));
            if (tracked && mutationsInFlight > 0) {
              throw new DOMException("Auth context is changing", "AbortError");
            }
            const cacheable =
              method === "GET" && tracked && requestURL.search === "";
            let response: Response;
            try {
              response = await originalFetch(input, init);
            } catch (error) {
              const cached = validSnapshot(snapshot);
              if (
                cacheable &&
                isCurrent() &&
                cached &&
                error instanceof TypeError
              ) {
                return Response.json(
                  path === "get-session" ? cached.session : cached.organization
                );
              }
              throw error;
            }
            // A response started before an account mutation must never restore that account.
            if (tracked && !isCurrent()) {
              throw new DOMException("Auth context changed", "AbortError");
            }
            if (tracked && response.ok) {
              const data: unknown = await response.clone().json();
              if (!isCurrent()) {
                throw new DOMException("Auth context changed", "AbortError");
              }
              if (path === "get-session") {
                const parsed = sessionSchema.safeParse(data);
                if (
                  !parsed.success ||
                  parsed.data.session.expiresAt.getTime() <= Date.now()
                ) {
                  clear();
                  clearView(true);
                } else {
                  if (
                    pendingSession &&
                    (pendingSession.session.id !== parsed.data.session.id ||
                      pendingSession.session.activeOrganizationId !==
                        parsed.data.session.activeOrganizationId)
                  ) {
                    clear();
                    resetAtoms();
                  }
                  pendingSession = parsed.data;
                  save();
                }
              } else {
                const parsed = organizationSchema.safeParse(data);
                pendingOrganization = parsed.success ? parsed.data : null;
                save();
                if (!parsed.success) {
                  clearView(false);
                }
              }
            } else if (
              tracked &&
              (response.status === 401 || response.status === 403)
            ) {
              if (path === "get-session") {
                clear();
              } else {
                pendingOrganization = null;
                save();
              }
              clearView(path === "get-session");
            }
            return response;
          };
          if (options) {
            options.customFetchImpl = wrappedFetch as typeof fetch;
          }
          return {
            url,
            options: options ?? {
              customFetchImpl: wrappedFetch as typeof fetch,
            },
          };
        },
      },
    ],
  };
}
