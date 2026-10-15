import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLogout } from "./use-logout";

const {
  logout,
  navigate,
  usePowerSyncSession,
  useRegion,
  useRegionClients,
  useLocation,
} = vi.hoisted(() => ({
  logout: vi.fn(),
  navigate: vi.fn(),
  usePowerSyncSession: vi.fn(),
  useRegion: vi.fn(),
  useRegionClients: vi.fn(),
  useLocation: vi.fn(),
}));

vi.mock("@repo/data/core", () => ({ usePowerSyncSession }));
vi.mock("@repo/features/auth", () => ({
  createLogoutNavigationState: () => ({ logoutPending: true }),
}));
vi.mock("@repo/features/region", () => ({ useRegion, useRegionClients }));
vi.mock("react-router", () => ({
  useLocation,
  useNavigate: () => navigate,
}));
vi.mock("./logout", () => ({ logout }));

describe("useLogout", () => {
  it("replaces the protected URL with auth without redirectTo", async () => {
    usePowerSyncSession.mockReturnValue({ id: "power-sync" });
    useRegion.mockReturnValue({
      pathWithRegion: (path: string) => `${path}?region=eu`,
    });
    useRegionClients.mockReturnValue({
      authClient: { id: "auth" },
      manifest: { apiUrl: "https://api.example.com" },
    });
    useLocation.mockReturnValue({
      hash: "",
      pathname: "/organization",
      search: "?region=eu",
    });
    logout.mockImplementation(async ({ beforeSignOut }) => {
      beforeSignOut();
    });
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current();
    });

    expect(logout).toHaveBeenCalledWith({
      authClient: { id: "auth" },
      beforeSignOut: expect.any(Function),
      powerSyncSession: { id: "power-sync" },
    });
    expect(navigate).toHaveBeenCalledWith("/auth?region=eu", {
      replace: true,
      state: { logoutPending: true },
    });
  });
});
