/** @vitest-environment happy-dom */

import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuTrigger,
} from "./index";

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({ useIsMobile: vi.fn() }));
afterEach(cleanup);

it.each(["desktop", "mobile"])(
  "respects item behavior on %s",
  async (device) => {
    const mobile = device === "mobile";
    vi.mocked(useIsMobile).mockReturnValue(mobile);
    const user = userEvent.setup();
    const onKeep = vi.fn();
    const onClose = vi.fn();
    render(
      <ResponsiveDropdownMenu>
        <ResponsiveDropdownMenuTrigger>Options</ResponsiveDropdownMenuTrigger>
        <ResponsiveDropdownMenuContent title="Options">
          <ResponsiveDropdownMenuItem
            className={({ disabled }) =>
              disabled ? "unavailable" : "available"
            }
            disabled
          >
            Unavailable
          </ResponsiveDropdownMenuItem>
          <ResponsiveDropdownMenuItem closeOnClick={false} onClick={onKeep}>
            Keep open
          </ResponsiveDropdownMenuItem>
          <ResponsiveDropdownMenuItem onClick={onClose}>
            Done
          </ResponsiveDropdownMenuItem>
        </ResponsiveDropdownMenuContent>
      </ResponsiveDropdownMenu>
    );

    const role = mobile ? "button" : "menuitem";
    const trigger = screen.getByRole("button", { name: "Options" });
    await user.tab();
    await user.keyboard("{Enter}");
    const disabledItem = await screen.findByRole(role, { name: "Unavailable" });
    expect(disabledItem.classList.contains("unavailable")).toBe(true);
    expect(disabledItem.matches(":disabled, [aria-disabled=true]")).toBe(true);

    const keep = screen.getByRole(role, { name: "Keep open" });
    await user.click(keep);
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(screen.getByRole(role, { name: "Keep open" })).toBe(keep);
    const done = screen.getByRole(role, { name: "Done" });
    done.focus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole(role, { name: "Done" })).toBeNull()
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  }
);
