/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { HotkeysProvider } from "@repo/features/hotkeys";
import { useSyncExternalStore } from "react";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useLocation,
  useParams,
} from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  APP_TOOLS,
  createEnabledAppToolRoutes,
  type AppToolId,
} from "../app-tools";
import { AppBarNavigation, AppLogo } from "./app-bar-navigation";
import { AppToolLayout } from "./app-tool-layout";

const featureAccess = vi.hoisted(() => ({ allowed: true, pending: false }));
const sessionUser = vi.hoisted(() => ({
  id: "user",
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    sessionUser.listeners.add(listener);
    return () => sessionUser.listeners.delete(listener);
  },
  setId(id: string) {
    sessionUser.id = id;
    for (const listener of sessionUser.listeners) {
      listener();
    }
  },
}));
vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: () => featureAccess,
}));

vi.mock("@repo/features/region", () => ({
  useRegionClients: () => ({
    authClient: {
      useSession: () => {
        const id = useSyncExternalStore(
          sessionUser.subscribe,
          () => sessionUser.id
        );
        return { data: { user: { id } } };
      },
    },
  }),
}));

vi.mock("@repo/agent-work/routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/agent-work/routes")>()),
  AgentWorkSessionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock(import("@repo/platform"), async (importOriginal) => ({
  ...(await importOriginal()),
  getOperatingSystem: () => "mac",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "common.comingSoon": "Coming soon",
        "common.home": "Home",
        "editor.agentWork": "Agent",
        "editor.chats": "Chats",
        "editor.navigation": "Workspace tools",
        "editor.workspaces": "Workspaces",
      })[key] ?? key,
  }),
}));

function routesForAgentWork() {
  return createEnabledAppToolRoutes({
    AppBarLeading: () => null,
    AppBarTrailing: () => null,
    buildVersion: "test",
    shell: "desktop",
  })[1]?.path;
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderNavigation() {
  return render(
    <HotkeysProvider>
      <MemoryRouter initialEntries={["/workspaces/workspace-id"]}>
        <AppLogo />
        <AppBarNavigation activeToolId="workspaces" />
        <LocationProbe />
      </MemoryRouter>
    </HotkeysProvider>
  );
}

describe("AppBarNavigation", () => {
  it("keeps Agent visible as coming soon when the shared flag is off", () => {
    featureAccess.allowed = false;
    const result = renderNavigation();
    expect(
      (
        screen.getByRole("button", {
          name: "Agent — Coming soon",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.keyDown(document, { code: "Digit3", ctrlKey: true, key: "3" });
    expect(screen.getByTestId("location").textContent).toBe(
      "/workspaces/workspace-id"
    );
    result.unmount();
    featureAccess.allowed = true;
  });

  it("declares Workspaces and Agent as enabled tools", () => {
    expect(APP_TOOLS.map(({ enabled, id }) => ({ enabled, id }))).toEqual([
      { enabled: true, id: "workspaces" },
      { enabled: true, id: "agent-work" },
      { enabled: false, id: "chats" },
    ]);
  });

  it("builds organization routes from enabled tool definitions", () => {
    const routes = createEnabledAppToolRoutes({
      AppBarLeading: () => null,
      AppBarTrailing: () => null,
      buildVersion: "test",
      shell: "desktop",
    });

    expect(routes).toHaveLength(2);
    expect(
      routes[0]?.children?.some((route) => route.path === ":workspaceSlug")
    ).toBe(true);
  });

  it("shows brand and app navigation inline", () => {
    renderNavigation();

    const logo = screen.getByRole("link", { name: "Lunaris" });
    expect(logo.getAttribute("href")).toBe("/");
    expect(logo.className).toContain("size-8");
    expect(
      Array.from(logo.querySelectorAll("img")).map((image) => ({
        height: image.height,
        width: image.width,
      }))
    ).toEqual([
      { height: 28, width: 28 },
      { height: 28, width: 28 },
    ]);

    const navigation = screen.getByRole("navigation", {
      name: "Workspace tools",
    });
    expect(navigation.className).toContain("items-center");
    expect(navigation.className).not.toContain("flex-col");

    const home = screen.getByRole("button", { name: "Home" });
    expect(home.getAttribute("href")).toBe("/");
    expect(home.getAttribute("aria-keyshortcuts")).toBe("Control+1");

    const workspace = screen.getByRole("button", { name: "Workspaces" });
    expect(workspace.getAttribute("aria-current")).toBe("page");
    expect(workspace.getAttribute("aria-keyshortcuts")).toBe("Control+2");

    expect(
      (
        screen.getByRole("button", {
          name: "Chats — Coming soon",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Agent" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(routesForAgentWork()).toBe("agent-work");
  });

  it("opens Home with the platform shortcut", () => {
    renderNavigation();

    fireEvent.keyDown(document, { code: "Digit1", ctrlKey: true, key: "1" });
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("restores both tool views, their locations, and the visible tool's shortcuts", async () => {
    function ToolView({ tool }: { tool: AppToolId }) {
      const { viewId } = useParams();
      return (
        <>
          <AppBarNavigation activeToolId={tool} />
          <input aria-label={`${tool} draft`} defaultValue="" />
          <output data-testid={`${tool}-route`}>
            {useLocation().pathname} {viewId}
          </output>
        </>
      );
    }
    const workspaceUrl = "/team/project/draft?filter=starred#selection";
    const router = createMemoryRouter(
      [
        {
          path: ":organizationSlug",
          Component: AppToolLayout,
          children: [
            {
              path: ":workspaceSlug/:viewId",
              element: <ToolView tool="workspaces" />,
            },
            { path: "agent-work", element: <ToolView tool="agent-work" /> },
          ],
        },
      ],
      { initialEntries: [workspaceUrl] }
    );
    render(
      <HotkeysProvider>
        <RouterProvider router={router} />
      </HotkeysProvider>
    );
    const workspaceDraft = screen.getByRole<HTMLInputElement>("textbox", {
      name: "workspaces draft",
    });
    fireEvent.change(workspaceDraft, { target: { value: "Workspace text" } });
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    const agentDraft = await screen.findByRole<HTMLInputElement>("textbox", {
      name: "agent-work draft",
    });
    fireEvent.change(agentDraft, { target: { value: "Agent text" } });
    expect(
      screen.queryByRole("textbox", { name: "workspaces draft" })
    ).toBeNull();
    expect(workspaceDraft.closest("[inert]")).toBeTruthy();
    expect(screen.getByTestId("workspaces-route").textContent).toBe(
      "/team/project/draft draft"
    );

    fireEvent.keyDown(document, { code: "Digit2", ctrlKey: true, key: "2" });
    expect(
      await screen.findByRole("textbox", { name: "workspaces draft" })
    ).toBe(workspaceDraft);
    expect(workspaceDraft.value).toBe("Workspace text");
    expect(router.state.location).toMatchObject({
      pathname: "/team/project/draft",
      search: "?filter=starred",
      hash: "#selection",
    });

    fireEvent.keyDown(document, { code: "Digit3", ctrlKey: true, key: "3" });
    expect(
      await screen.findByRole("textbox", { name: "agent-work draft" })
    ).toBe(agentDraft);
    expect(agentDraft.value).toBe("Agent text");
    const activeLocation = router.state.location;
    fireEvent.keyDown(document, { code: "Digit3", ctrlKey: true, key: "3" });
    expect(router.state.location).toBe(activeLocation);

    // A different signed-in user gets a fresh tool view.
    try {
      act(() => sessionUser.setId("other-user"));
      expect(
        screen.getByRole<HTMLInputElement>("textbox", {
          name: "agent-work draft",
        }).value
      ).toBe("");
      expect(screen.queryByTestId("workspaces-route")).toBeNull();
    } finally {
      act(() => sessionUser.setId("user"));
    }
  });
});
