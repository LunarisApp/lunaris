/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth";
import { HotkeyOverridesProvider } from "../hotkeys";
import { UserMenu } from ".";
import { MobileUserMenu } from "./mobile-user-menu";

const { addAccount, refreshAccounts, switchAccount } = vi.hoisted(() => ({
  addAccount: vi.fn(),
  refreshAccounts: vi.fn(),
  switchAccount: vi.fn(),
}));

vi.mock("@repo/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/platform")>();
  return { ...actual, getOperatingSystem: () => "mac" };
});

vi.mock("../auth/components/user-avatar", () => ({
  UserAvatar: ({
    className,
    size: _size,
    user: _user,
    ...spanProps
  }: ComponentProps<"span"> & { size?: string; user?: unknown }) => (
    <span className={className} {...spanProps}>
      RV
    </span>
  ),
}));

vi.mock("./use-account-switcher", () => ({
  useAccountSwitcher: () => ({
    accountListStatus: "ready",
    accounts: [
      {
        session: { id: "session-1", token: "token-1" },
        user: {
          email: "rhea@example.com",
          id: "user_1",
          name: "Rhea Vale",
        },
      },
    ],
    addAccount,
    currentUserId: "user_1",
    isSwitching: false,
    refreshAccounts,
    switchAccount,
  }),
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) =>
        ({
          "common.logout": "Log out",
          "common.settings": "Settings",
          "common.user": "User",
          "auth.accounts": "Accounts",
          "auth.addAccount": "Add account",
          "auth.logoutAllAccounts": "Log out all accounts",
          "helpCenter.needHelp": "Need help?",
          "workspaces.switchOrganization": "Switch organization",
        })[key] ?? key,
    }),
  };
});

const client = {
  useSession: () => ({
    data: {
      user: {
        email: "rhea@example.com",
        id: "user_1",
        name: "Rhea Vale",
      },
    },
  }),
} as never;

function renderMenu(menu: ReactNode) {
  render(
    <MemoryRouter>
      <HotkeyOverridesProvider>
        <AuthProvider client={client}>{menu}</AuthProvider>
      </HotkeyOverridesProvider>
    </MemoryRouter>
  );
}

describe("user menus", () => {
  it("keeps organization actions out of desktop user menu", async () => {
    const user = userEvent.setup();
    renderMenu(<UserMenu />);

    await user.click(screen.getByTestId("user-menu-trigger"));

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    expect(settings).toBeTruthy();
    expect(
      settings.querySelector("[data-slot=dropdown-menu-shortcut]")?.textContent
    ).toBe("⌘,");
    expect(screen.getByRole("menuitem", { name: "Add account" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeTruthy();
    expect(screen.queryByText("Switch organization")).toBeNull();
  });

  it("keeps organization actions out of mobile user menu", async () => {
    const user = userEvent.setup();
    renderMenu(<MobileUserMenu />);

    await user.click(screen.getByText("RV"));

    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Need help?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(screen.queryByText("Switch organization")).toBeNull();
  });

  it("opens mobile help through platform navigation", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    renderMenu(<MobileUserMenu />);

    await user.click(screen.getByText("RV"));
    fireEvent.click(screen.getByRole("button", { name: "Need help?" }));

    expect(open).toHaveBeenCalledWith("mailto:hello@lunaris.app");
    open.mockRestore();
  });
});
