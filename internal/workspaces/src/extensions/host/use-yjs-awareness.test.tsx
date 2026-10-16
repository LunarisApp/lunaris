import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Doc } from "yjs";
import type { ResourceStorageHandle } from "@lunarisapp/plugin-sdk";
import { useHostYjsAwareness } from "./use-yjs-awareness";

const state = vi.hoisted(() => ({
  session: {
    user: { id: "user" },
    session: { id: "session", activeOrganizationId: "org" },
  } as object | null,
  visibility: "shared",
  online: true,
  doc: null as unknown,
  post: vi.fn(),
}));
vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceViewPresenceScope: () => ({
    isVisible: true,
    storage: { content: { kind: "yjs", storageId: "slot" } },
  }),
}));
vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud" },
  useSyncAccess: () => "cloud",
}));
vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  useStorageSlot: () => ({
    data: [{ kind: "yjs", backing_id: "doc", workspace_id: "workspace" }],
  }),
}));
vi.mock("@repo/data/features/yjs", () => ({
  useReadyYjsDocument: () => ({ yDoc: state.doc }),
}));
vi.mock("@repo/features/api", () => ({
  useApi: () => ({ baseUrl: "https://api.example.com", post: state.post }),
}));
vi.mock("@repo/features/auth/context", () => ({
  useAuth: () => ({ useSession: () => ({ data: state.session }) }),
}));
vi.mock("@repo/platform", () => ({ useOnlineStatus: () => state.online }));
vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceVisibility: state.visibility }),
}));
const storage = { storageId: "slot", kind: "yjs" } as ResourceStorageHandle;
let doc: Doc;
beforeEach(() => {
  doc = new Doc();
  state.doc = doc;
  state.visibility = "shared";
  state.online = true;
  state.session = {
    user: { id: "user" },
    session: { id: "session", activeOrganizationId: "org" },
  };
  state.post.mockReset().mockImplementation(() => new Promise(() => {}));
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => doc.destroy());
describe("resource view presence visibility", () => {
  it("does not announce inactive views and shares leases across visible panes", () => {
    const a = renderHook(
      ({ enabled }) => useHostYjsAwareness(storage, "workspace", { enabled }),
      { initialProps: { enabled: false } }
    );
    expect(state.post).not.toHaveBeenCalled();
    a.rerender({ enabled: true });
    const b = renderHook(() =>
      useHostYjsAwareness(storage, "workspace", { enabled: true })
    );
    expect(state.post).toHaveBeenCalledTimes(1);
    expect(a.result.current.awareness).toBe(b.result.current.awareness);
    a.unmount();
    expect(b.result.current.status).toBe("connecting");
    b.unmount();
  });
  it("releases hidden tabs and starts a fresh lease when visible", () => {
    const view = renderHook(() =>
      useHostYjsAwareness(storage, "workspace", { enabled: true })
    );
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(view.result.current.status).toBe("unavailable");
    expect(view.result.current.awareness?.getLocalState()).toBeNull();
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.post).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it("never connects local workspaces and releases on logout", () => {
    state.visibility = "local";
    const view = renderHook(() =>
      useHostYjsAwareness(storage, "workspace", { enabled: true })
    );
    expect(state.post).not.toHaveBeenCalled();
    expect(view.result.current.awareness).toBeNull();
    state.visibility = "shared";
    view.rerender();
    expect(state.post).toHaveBeenCalledOnce();
    state.session = null;
    view.rerender();
    expect(view.result.current.awareness).toBeNull();
    view.unmount();
  });
});
