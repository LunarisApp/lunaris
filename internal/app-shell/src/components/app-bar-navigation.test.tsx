/** @vitest-environment happy-dom */

import {
  fireEvent,
  render,
  screen,
} from "../../../features/node_modules/@testing-library/react";
import { HotkeysProvider } from "@repo/features/hotkeys";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { APP_TOOLS, createEnabledAppToolRoutes } from "../app-tools";
import { AppBarNavigation, AppLogo } from "./app-bar-navigation";

const featureAccess = vi.hoisted(() => ({ allowed: true, pending: false }));
vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: () => featureAccess,
}));

vi.mock("@repo/platform", () => ({
  getOperatingSystem: () => "mac",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "common.comingSoon": "Coming soon",
        "common.home": "Home",
        "editor.agentWork": "Agent Work",
        "editor.chats": "Chats",
        "editor.navigation": "Workspace tools",
        "editor.workspaces": "Workspaces",
      })[key] ?? key,
  }),
}));

function routesForAgentWork() {
  return createEnabledAppToolRoutes({ AppBarLeading: () => null, AppBarTrailing: () => null, buildVersion: "test", shell: "desktop" })[1]?.path;
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
    </HotkeysProvider>,
  );
}

describe("AppBarNavigation", () => {
  it("keeps Agent Work visible as coming soon when the shared flag is off", () => {
    featureAccess.allowed = false;
    const result = renderNavigation();
    expect((screen.getByRole("button", { name: "Agent Work — Coming soon" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { code: "Digit3", ctrlKey: true, key: "3" });
    expect(screen.getByTestId("location").textContent).toBe("/workspaces/workspace-id");
    result.unmount();
    featureAccess.allowed = true;
  });

  it("declares Workspaces and Agent Work as enabled tools", () => {
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
      routes[0]?.children?.some((route) => route.path === ":workspaceSlug"),
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
      })),
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
      (screen.getByRole("button", {
        name: "Chats — Coming soon",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Agent Work" }) as HTMLButtonElement).disabled).toBe(false);
    expect(routesForAgentWork()).toBe("agent-work");
  });

  it("opens Home with the platform shortcut", () => {
    renderNavigation();

    fireEvent.keyDown(document, { code: "Digit1", ctrlKey: true, key: "1" });
    expect(screen.getByTestId("location").textContent).toBe("/");
  });
});
