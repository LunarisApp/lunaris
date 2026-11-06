import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacesSortControl } from "./workspaces-sort-control";

const state = vi.hoisted(() => ({ isMobile: false }));
vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => state.isMobile,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

describe("workspace sorting", () => {
  it("opens a mobile sheet and changes sorting", async () => {
    state.isMobile = true;
    const onChange = vi.fn();
    render(<WorkspacesSortControl onChange={onChange} value="activity" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "workspaces.sortBy" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "workspaces.sortByActivity" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    await user.click(
      screen.getByRole("button", { name: "workspaces.sortByName" })
    );
    expect(onChange).toHaveBeenCalledWith("name");
  });

  it("keeps the desktop select and its selected value", async () => {
    state.isMobile = false;
    const onChange = vi.fn();
    render(<WorkspacesSortControl onChange={onChange} value="name" />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("combobox", { name: "workspaces.sortBy" });
    expect(trigger.textContent).toContain("workspaces.sortByName");
    await user.click(trigger);
    await user.click(
      screen.getByRole("option", { name: "workspaces.sortByActivity" })
    );
    expect(onChange).toHaveBeenCalledWith("activity");
  });
});
