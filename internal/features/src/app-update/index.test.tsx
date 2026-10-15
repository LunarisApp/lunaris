import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppUpdateButton, AppUpdateProvider, useAppUpdate } from ".";

function UpdateProbe() {
  const update = useAppUpdate();
  return <span>{update.needRefresh ? "refresh" : "current"}</span>;
}

describe("AppUpdateProvider", () => {
  it("defaults to no desktop update prompt", () => {
    render(
      <AppUpdateProvider>
        <UpdateProbe />
      </AppUpdateProvider>,
    );

    expect(screen.getByText("current")).toBeTruthy();
  });

  it("shows the browser refresh shortcut when an update is available", () => {
    render(
      <AppUpdateProvider value={{ needRefresh: true, update: async () => {} }}>
        <AppUpdateButton />
      </AppUpdateProvider>,
    );

    const shortcut = screen.getByText(/^(⌘R|Ctrl\+R)$/);
    expect(shortcut.tagName).toBe("KBD");
    expect(shortcut.className).toContain("bg-blue-200");
    expect(shortcut.className).toContain("dark:bg-blue-800/50");
  });
});
