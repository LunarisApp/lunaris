import { createBrowserPlatform } from "@repo/platform";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserRouter } = vi.hoisted(() => ({
  createBrowserRouter: vi.fn(() => ({ id: "router" })),
}));
const { markDefaultWorkspaceSeedPending } = vi.hoisted(() => ({
  markDefaultWorkspaceSeedPending: vi.fn(),
}));

vi.mock("@repo/workspaces/bootstrap", () => ({
  markDefaultWorkspaceSeedPending,
}));

vi.mock("@repo/features/auth/pages/sign-in", () => ({
  default: ({
    onAnonymousSessionCreated,
  }: {
    onAnonymousSessionCreated?: () => void;
  }) => (
    <button onClick={onAnonymousSessionCreated} type="button">
      Continue as guest
    </button>
  ),
}));

vi.mock("@repo/features/auth/pages/register", () => ({
  default: ({
    onRegistrationCompleted,
  }: {
    onRegistrationCompleted?: (email: string) => void;
  }) => (
    <button
      onClick={() => onRegistrationCompleted?.("ada@example.com")}
      type="button"
    >
      Register
    </button>
  ),
}));

vi.mock("./config", () => ({
  default: {
    REGION_DIRECTORY_JSON: [],
    REGION_DIRECTORY_URL: "https://lunaris.app/.well-known/lunaris-regions",
  },
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    createBrowserRouter,
    RouterProvider: ({ router }: { router: unknown }) => (
      <div data-router={JSON.stringify(router)} />
    ),
  };
});

vi.mock("@repo/features/region", () => ({
  useRegionClients: () => ({ authClient: {
    useSession: () => ({ data: { user: { id: "user" }, session: { activeOrganizationId: "org" } }, isPending: false }),
    useActiveOrganization: () => ({ data: { id: "org", slug: "team" }, isPending: false }),
  } }),
  RegionProvider: ({ children }: { children: React.ReactNode }) => children,
  RegionReady: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@repo/features/auth/redirect", () => ({
  getAccountSwitchTargetUserId: () => null,
  useAuthRedirect: () => ({ redirectTo: null, resolvedRedirectTo: "/" }),
}));
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { AppRuntime } from "./index";

vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  removeItem: vi.fn(),
  setItem: vi.fn(),
});

const { default: AppRouter } = await import("./router");

beforeEach(() => {
  createBrowserRouter.mockClear();
  markDefaultWorkspaceSeedPending.mockClear();
});

function collectRoutePaths(
  routes: Array<{ children?: unknown[]; path?: string }>
): string[] {
  return routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...collectRoutePaths(
      (route.children ?? []) as Array<{ children?: unknown[]; path?: string }>
    ),
  ]);
}

function findRoute(
  routes: Array<{ children?: unknown[]; path?: string }>,
  path: string,
): Record<string, unknown> | undefined {
  for (const route of routes) {
    if (route.path === path) return route as Record<string, unknown>;
    const nested = findRoute(
      (route.children ?? []) as Array<{ children?: unknown[]; path?: string }>,
      path,
    );
    if (nested) return nested;
  }
}

describe("AppRouter", () => {
  it.each([
    { key: "default", resume: true },
    { key: "home-click", resume: false },
  ])("restores only startup root entry ($key)", async ({ key, resume }) => {
    render(<AppRouter shell="desktop" />);
    type CapturedRoute = { index?: boolean; element?: React.ReactNode; children?: CapturedRoute[] };
    const routes = createBrowserRouter.mock.calls[0]?.[0] as CapturedRoute[];
    const findIndex = (items: CapturedRoute[]): CapturedRoute | undefined => {
      for (const route of items) {
        if (route.index) return route;
        const child = findIndex(route.children ?? []);
        if (child) return child;
      }
    };
    const index = findIndex(routes);
    function Destination() {
      const location = useLocation();
      return <div>{location.state?.resumeLastWorkspace ? "resume-workspace" : "show-list"}</div>;
    }
    render(<MemoryRouter initialEntries={[{ pathname: "/", key }]}><Routes>
      <Route path="/" element={index?.element} />
      <Route path="/team" element={<Destination />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText(resume ? "resume-workspace" : "show-list")).toBeTruthy();
  });

  it("registers nested plugin subview URLs", () => {
    render(<AppRouter shell="desktop" />);

    const routes = createBrowserRouter.mock.calls[0]?.[0] as Array<{
      children?: unknown[];
      path?: string;
    }>;
    expect(collectRoutePaths(routes)).toContain(
      ":viewId/:subviewPath/:subviewId"
    );
  });

  it("loads non-workspace-list pages lazily", () => {
    render(<AppRouter shell="desktop" />);

    const routes = createBrowserRouter.mock.calls[0]?.[0] as Array<{
      children?: unknown[];
      path?: string;
    }>;
    expect(findRoute(routes, "auth")?.lazy).toBeTypeOf("function");
    expect(findRoute(routes, "settings")?.lazy).toBeTypeOf("function");
    expect(findRoute(routes, ":workspaceSlug")?.lazy).toBeTypeOf("function");
    expect(findRoute(routes, ":organizationSlug")?.Component).toBeDefined();
  });

  it("keeps workspace routes scoped apart from organization settings", () => {
    render(<AppRouter shell="desktop" />);

    const routes = createBrowserRouter.mock.calls[0]?.[0] as Array<{
      children?: Array<{
        children?: Array<{ index?: boolean; path?: string }>;
        lazy?: unknown;
        path?: string;
      }>;
      path?: string;
    }>;
    const organizationRoute = findRoute(
      routes,
      ":organizationSlug",
    ) as (typeof routes)[number];
    const organizationSettings = organizationRoute.children?.find(
      (route) => route.path === "settings",
    );
    const workspaceScope = organizationRoute.children?.find(
      (route) =>
        !route.path &&
        route.children?.some((child) => child.path === ":workspaceSlug"),
    );

    expect(organizationSettings?.lazy).toBeTypeOf("function");
    expect(workspaceScope?.lazy).toBeTypeOf("function");
    expect(workspaceScope?.children?.some((route) => route.index)).toBe(true);
    expect(
      workspaceScope?.children?.some(
        (route) => route.path === ":workspaceSlug",
      ),
    ).toBe(true);
  });

  it.each([
    {
      button: "Continue as guest",
      expected: { kind: "anonymous" },
      path: "auth",
    },
    {
      button: "Register",
      expected: { email: "ada@example.com", kind: "registered" },
      path: "auth/register",
    },
  ])("marks workspace bootstrap after $path succeeds", async (testCase) => {
    render(<AppRouter shell="desktop" />);
    const routes = createBrowserRouter.mock.calls[0]?.[0] as Array<{
      children?: unknown[];
      path?: string;
    }>;
    const route = findRoute(routes, testCase.path) as {
      lazy: () => Promise<{ Component: ComponentType }>;
    };
    const { Component } = await route.lazy();

    render(<Component />);
    fireEvent.click(screen.getByRole("button", { name: testCase.button }));

    expect(markDefaultWorkspaceSeedPending).toHaveBeenCalledWith(
      testCase.expected,
    );
  });

  it("keeps router identity when only app update state changes", () => {
    const createRegionClients = vi.fn();
    const firstRuntime: AppRuntime = {
      appUpdate: { needRefresh: false, update: async () => {} },
      authCallbackBaseUrl: "https://app.example",
      createPowerSyncSession: vi.fn(),
      createRegionClients,
      platform: createBrowserPlatform({ kind: "web" }),
    };
    const { rerender } = render(
      <AppRouter runtime={firstRuntime} shell="desktop" />,
    );

    rerender(
      <AppRouter
        runtime={{
          ...firstRuntime,
          appUpdate: { needRefresh: true, update: async () => {} },
        }}
        shell="desktop"
      />,
    );

    expect(createBrowserRouter).toHaveBeenCalledOnce();
  });
});
