import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import DeviceAuthorizationPage from "./device";

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) => path,
    region: { id: "local", label: "Local" },
  }),
  useRegionClients: () => ({
    manifest: { apiUrl: "https://api.example.com" },
    authClient: {
      $fetch: fetch,
      useSession: () => ({
        data: { user: { id: "user", emailVerified: true } },
        isPending: false,
      }),
    },
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/auth/device?user_code=ABCD-EFGH"]}>
        <DeviceAuthorizationPage />
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
