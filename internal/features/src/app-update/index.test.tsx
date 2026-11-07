import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      </AppUpdateProvider>
    );

    expect(screen.getByText("current")).toBeTruthy();
  });

  it("shows the browser refresh shortcut when an update is available", () => {
    render(
      <AppUpdateProvider value={{ needRefresh: true, update: async () => {} }}>
        <AppUpdateButton />
      </AppUpdateProvider>
    );

    const shortcut = screen.getByText(/^(⌘R|Ctrl\+R)$/);
    expect(shortcut.tagName).toBe("KBD");
    expect(shortcut.className).toContain("bg-blue-200");
    expect(shortcut.className).toContain("dark:bg-blue-800/50");
  });

  it("shows desktop progress without a browser shortcut and disables duplicate installs", () => {
    render(
      <AppUpdateProvider
        value={{
          needRefresh: true,
          requiresRestart: true,
          phase: "downloading",
          progress: 42,
          update: async () => {},
        }}
      >
        <AppUpdateButton />
      </AppUpdateProvider>
    );
    expect(screen.queryByText(/^(⌘R|Ctrl\+R)$/)).toBeNull();
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("42%");
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("shows failures and allows another attempt", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error("download failed"))
      .mockResolvedValue(undefined);
    render(
      <AppUpdateProvider
        value={{ needRefresh: true, requiresRestart: true, update }}
      >
        <AppUpdateButton />
      </AppUpdateProvider>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
