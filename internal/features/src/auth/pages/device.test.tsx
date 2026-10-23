import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import DeviceAuthorizationPage from "./device";

const { fetch, listDeviceSessions, setActive, signOut, assign, sessionState } =
  vi.hoisted(() => ({
    fetch: vi.fn(),
    listDeviceSessions: vi.fn().mockResolvedValue({ data: [] }),
    setActive: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    assign: vi.fn(),
    sessionState: {
      user: { id: "user", email: "first@example.com", emailVerified: true },
    },
  }));
vi.mock("@repo/platform", () => ({
  usePlatform: () => ({ navigation: { assign } }),
}));
vi.mock("../../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) => path,
    region: { id: "local", label: "Local" },
  }),
  useRegionClients: () => ({
    manifest: { apiUrl: "https://api.example.com" },
    authClient: {
      $fetch: fetch,
      multiSession: { listDeviceSessions, setActive },
      signOut,
      useSession: () => ({
        data: sessionState,
        isPending: false,
      }),
    },
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
function CurrentLocation() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/auth/device?user_code=ABCD-EFGH"]}>
        <DeviceAuthorizationPage />
        <CurrentLocation />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
describe("device authorization", () => {
  it("requires confirmation of a prefilled code before fetching details", () => {
    fetch.mockReset();
    mount();
    expect(screen.getByRole("textbox").getAttribute("value")).toBe("ABCD-EFGH");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("switches between signed-in users before approval", async () => {
    listDeviceSessions.mockResolvedValueOnce({
      data: [
        { session: { token: "first-token" }, user: sessionState.user },
        {
          session: { token: "second-token" },
          user: {
            id: "second",
            email: "second@example.com",
            emailVerified: true,
          },
        },
      ],
    });
    mount();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("combobox", { name: "auth.switchAccount" })
    );
    await user.click(
      await screen.findByRole("option", { name: "second@example.com" })
    );
    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({ sessionToken: "second-token" })
    );
    expect(assign).toHaveBeenCalledWith("/auth/device?user_code=ABCD-EFGH");
  });
  it("keeps current account usable when switching fails", async () => {
    setActive.mockRejectedValueOnce(new Error("Switch failed"));
    listDeviceSessions.mockResolvedValueOnce({
      data: [
        {
          session: { token: "second-token" },
          user: { id: "second", email: "second@example.com" },
        },
      ],
    });
    mount();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("combobox", { name: "auth.switchAccount" })
    );
    await user.click(
      await screen.findByRole("option", { name: "second@example.com" })
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Switch failed"
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
  it("shows logout failure and keeps consent available", async () => {
    signOut.mockResolvedValueOnce({ error: { message: "Logout failed" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "common.logout" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Logout failed"
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(
      "/auth/device?user_code=ABCD-EFGH"
    );
  });
  it("logs out and preserves device code for another login", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "common.logout" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain(
        "addAccount=true"
      )
    );
    const url = new URL(
      screen.getByTestId("location").textContent!,
      "https://lunaris.app"
    );
    expect(url.searchParams.get("redirectTo")).toBe(
      "/auth/device?user_code=ABCD-EFGH"
    );
  });
  it("preserves an unreviewed code when logging into another account", async () => {
    mount();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "WXYZ-1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "common.logout" }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain(
        "addAccount=true"
      )
    );
    const url = new URL(
      screen.getByTestId("location").textContent!,
      "https://lunaris.app"
    );
    expect(url.searchParams.get("redirectTo")).toBe(
      "/auth/device?user_code=WXYZ-1234"
    );
  });
  it("retries a failed account list", async () => {
    listDeviceSessions.mockResolvedValueOnce({ error: { message: "Offline" } });
    mount();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "auth.accountListFailed"
    );
    listDeviceSessions.mockResolvedValueOnce({
      data: [
        {
          session: { token: "second-token" },
          user: { id: "second", email: "second@example.com" },
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    expect(
      await screen.findByRole("combobox", { name: "auth.switchAccount" })
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("preserves an edited code in the return URL", async () => {
    fetch.mockReset().mockResolvedValue({ error: { message: "Code expired" } });
    mount();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "WXYZ-1234" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "auth.agentAuthorization.review" })
    );
    await screen.findByText("Code expired");
    expect(screen.getByTestId("location").textContent).toBe(
      "/auth/device?user_code=WXYZ1234"
    );
  });
  it("shows expiry and never approves a failed request", async () => {
    fetch.mockReset().mockResolvedValue({ error: { message: "Code expired" } });
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "auth.agentAuthorization.review" })
    );
    expect((await screen.findByRole("alert")).textContent).toBe("Code expired");
    expect(fetch).not.toHaveBeenCalledWith(
      "/device/approve",
      expect.anything()
    );
  });
  it("denies without creating a grant and completes on Lunaris", async () => {
    fetch.mockReset().mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === "/agent/authorization"
            ? {
                clientId: "cli",
                clientName: "Hermes",
                scopes: ["content:read"],
                resources: ["https://api.example.com/mcp"],
                organizations: [{ id: "org", name: "Team" }],
              }
            : { success: true },
      })
    );
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "auth.agentAuthorization.review" })
    );
    await screen.findByText("Hermes");
    fireEvent.click(
      screen.getByRole("button", { name: "auth.agentConsentDeny" })
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "auth.agentAuthorization.denied"
      )
    );
    expect(fetch).toHaveBeenCalledWith(
      "/device/deny",
      expect.objectContaining({ body: { userCode: "ABCDEFGH" } })
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "/agent/authorize",
      expect.anything()
    );
  });
});
