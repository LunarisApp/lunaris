import { act, render, screen, cleanup } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ResourcePresenceBoundary,
  useHostResourceAwareness,
} from "./resource-presence";
import { useResourceViewPresenceScope } from "@lunarisapp/plugin-sdk";
const state = vi.hoisted(() => ({
  session: {
    user: { id: "self" },
    session: { id: "session", activeOrganizationId: "org" },
  } as object | null,
  visibility: "shared",
  online: true,
  api: { baseUrl: "https://api.example.com", post: vi.fn() },
}));
vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud" },
  useSyncAccess: () => "cloud",
}));
vi.mock("@repo/features/api", () => ({ useApi: () => state.api }));
vi.mock("@repo/features/auth/context", () => ({
  useAuth: () => ({ useSession: () => ({ data: state.session }) }),
}));
vi.mock("@repo/platform", () => ({ useOnlineStatus: () => state.online }));
vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: () => ({
    workspaceId: "workspace",
    workspaceVisibility: state.visibility,
  }),
}));
const storage = {};
function Consumer({ channel = false }: { channel?: boolean }) {
  const scope = useResourceViewPresenceScope();
  useHostResourceAwareness("extension", "pointer", { enabled: channel });
  return <span>{scope?.presence.status}</span>;
}
function View({
  visible = true,
  channel = false,
}: {
  visible?: boolean;
  channel?: boolean;
}) {
  return (
    <ResourcePresenceBoundary
      resourceId="resource"
      storage={storage}
      isVisible={visible}
    >
      <Consumer channel={channel} />
    </ResourcePresenceBoundary>
  );
}
beforeEach(() => {
  state.api.post.mockReset().mockImplementation(() => new Promise(() => {}));
  state.session = {
    user: { id: "self" },
    session: { id: "session", activeOrganizationId: "org" },
  };
  state.visibility = "shared";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 10));
});
describe("automatic resource membership", () => {
  it("connects resources without storage and shares duplicate pane membership", () => {
    const first = render(<View />);
    const second = render(<View />);
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(state.api.post.mock.calls[0][0]).toContain(
      "/resources/resource/presence/ticket",
    );
    first.unmount();
    expect(screen.getByText("connecting")).toBeTruthy();
    second.unmount();
  });
  it("enforces host visibility and excludes local workspaces", () => {
    const view = render(<View visible={false} />);
    expect(state.api.post).not.toHaveBeenCalled();
    view.rerender(<View />);
    expect(state.api.post).toHaveBeenCalledTimes(1);
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("unavailable")).toBeTruthy();
    state.visibility = "local";
    view.rerender(<View />);
    expect(state.api.post).toHaveBeenCalledTimes(1);
  });
  it("activates interaction subscriptions after the host boundary in StrictMode", () => {
    const view = render(
      <StrictMode>
        <View channel />
      </StrictMode>,
    );
    expect(
      state.api.post.mock.calls.some(([path]) =>
        String(path).includes("/resources/resource/"),
      ),
    ).toBe(true);
    view.unmount();
  });
});
