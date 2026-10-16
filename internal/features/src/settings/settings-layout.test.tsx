import { UserIcon } from "@lunarisapp/ui/icons";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SettingsLayout } from "./settings-layout";

describe("SettingsLayout accessibility", () => {
  it("provides a keyboard bypass to the main content", () => {
    render(
      <MemoryRouter>
        <SettingsLayout
          backLabel="Back"
          backTo="/"
          contentTitle="Account"
          items={[
            {
              icon: UserIcon,
              id: "account",
              isActive: true,
              label: "Account",
              to: "/settings/account",
            },
          ]}
          skipToContentLabel="Skip to main content"
          title="Settings"
        >
          Account settings
        </SettingsLayout>
      </MemoryRouter>
    );

    expect(
      screen
        .getByRole("link", { name: "Skip to main content" })
        .getAttribute("href")
    ).toBe("#settings-content");
    const main = screen.getByRole("main");
    expect(main.id).toBe("settings-content");
    expect(main.tabIndex).toBe(-1);
  });
});
