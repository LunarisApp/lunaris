import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import userEvent from "@testing-library/user-event";
import { readLastWorkspace, rememberWorkspace } from "./last-workspace";
import { WorkspacesEntry } from "./workspaces-entry";

const mocks = vi.hoisted(() => ({ query: vi.fn(), canRead: true }));
vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud" },
  useSyncAccess: () => "local",
}));
vi.mock("@repo/data/features/workspaces", () => ({
  useWorkspacesQuery: (...args: unknown[]) => mocks.query(...args),
  WORKSPACE_INDEX_SYNC_STREAMS: [],
}));
vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div>loading</div>,
}));
vi.mock("@repo/features/permissions", () => ({
  useAllPermissions: () => mocks.canRead,
}));
vi.mock("@repo/features/region", () => ({
  useRegionClients: () => ({
    authClient: {
      useSession: () => ({ data: { user: { id: "user" } } }),
      useActiveOrganization: () => ({ data: { id: "org", slug: "team" } }),
    },
  }),
}));
function Workspace() {
  const location = useLocation();
  return (
    <>
      <div>{location.pathname}</div>
      <Link to="/team">All workspaces</Link>
    </>
  );
}
function mount(
  entry: string | { pathname: string; key: string; state?: unknown } = "/team",
) {
  const content = () => (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/team"
          element={
            <WorkspacesEntry initialLocationKey="default">
              <div>workspace list</div>
            </WorkspacesEntry>
          }
        />
        <Route path="/team/:workspaceSlug/*" element={<Workspace />} />
      </Routes>
    </MemoryRouter>
  );
  const result = render(content());
  return { ...result, refresh: () => result.rerender(content()) };
}
beforeEach(() => {
  localStorage.clear();
  mocks.canRead = true;
  mocks.query
    .mockReset()
    .mockReturnValue({
      data: [{ id: "ws", organization_id: "org", slug: "renamed" }],
      isLoading: false,
    });
  rememberWorkspace("user", "org", { workspaceId: "ws", viewPath: "/res_123" });
});
afterEach(cleanup);
describe("workspace startup", () => {
  it("restores saved resource using current workspace slug", async () => {
    mount();
    expect(await screen.findByText("/team/renamed/res_123")).toBeTruthy();
    expect(mocks.query).toHaveBeenCalledWith({
      id: "ws",
      organizationId: "org",
      options: undefined,
    });
  });
  it("keeps explicit workspace-list navigation open", async () => {
    mount();
    await userEvent.click(await screen.findByText("All workspaces"));
    expect(screen.getByText("workspace list")).toBeTruthy();
  });
  it("honors direct links", () => {
    mount("/team/other/res_456");
    expect(screen.getByText("/team/other/res_456")).toBeTruthy();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("resumes after root redirect", async () => {
    mount({
      pathname: "/team",
      key: "redirect",
      state: { resumeLastWorkspace: true },
    });
    expect(await screen.findByText("/team/renamed/res_123")).toBeTruthy();
  });
  it("shows list for missing workspace", () => {
    mocks.query.mockReturnValue({ data: [], isLoading: false });
    mount();
    expect(screen.getByText("workspace list")).toBeTruthy();
  });
  it("does not resume later when a missing workspace arrives after showing the list", () => {
    mocks.query.mockReturnValue({ data: [], isLoading: false });
    const view = mount();
    expect(screen.getByText("workspace list")).toBeTruthy();
    mocks.query.mockReturnValue({ data: [{ id: "ws", organization_id: "org", slug: "renamed" }], isLoading: false });
    view.refresh();
    expect(screen.getByText("workspace list")).toBeTruthy();
  });
  it("waits for workspace query", () => {
    mocks.query.mockReturnValue({ data: [], isLoading: true });
    mount();
    expect(screen.getByText("loading")).toBeTruthy();
  });
  it("shows list when permission denied", () => {
    mocks.canRead = false;
    mount();
    expect(screen.getByText("workspace list")).toBeTruthy();
  });
  it("isolates accounts and organizations", () => {
    expect(readLastWorkspace("other-user", "org")).toBeNull();
    expect(readLastWorkspace("user", "other-org")).toBeNull();
  });
  it("tolerates unavailable storage", () => {
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readLastWorkspace("user", "org")).toBeNull();
    spy.mockRestore();
  });
  it("rejects unsafe saved paths", () => {
    rememberWorkspace("user", "org", {
      workspaceId: "ws",
      viewPath: "/../../auth",
    });
    expect(readLastWorkspace("user", "org")).toBeNull();
  });
});
