import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAuth, listSessions, listUserPasskeys, navigate, sessionState } =
  vi.hoisted(() => ({
    fetchAuth: vi.fn(),
    listSessions: vi.fn(),
    listUserPasskeys: vi.fn(),
    navigate: vi.fn(),
    sessionState: {
      data: {
        user: {
          email: "writer@example.com",
          isAnonymous: false,
          twoFactorEnabled: false,
        },
      },
      isPending: false,
    },
  }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}));

vi.mock("react-router", () => ({
  useLocation: () => ({ hash: "", pathname: "/settings/account", search: "" }),
  useNavigate: () => navigate,
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({
    $fetch: fetchAuth,
    listSessions,
    passkey: { listUserPasskeys },
    supportsPasskeys: () => true,
    useSession: () => ({ ...sessionState, refetch: vi.fn() }),
  }),
}));

vi.mock("../../region", () => ({
  useRegion: () => ({
    authUrl: (path: string) => `https://api.example.com${path}`,
    pathWithRegion: (path: string) => path,
  }),
}));

import { SecurityContent } from "./security";

function renderSecurity() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SecurityContent />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", class PublicKeyCredential {});
  fetchAuth.mockReset();
  listSessions.mockReset();
  listUserPasskeys.mockReset();
  navigate.mockReset();
  listSessions.mockResolvedValue({ data: [] });
  listUserPasskeys.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("SecurityContent passkey layout", () => {
  it("renders scoped offline states instead of infinite loaders", async () => {
    onlineManager.setOnline(false);

    renderSecurity();

    expect(
      await screen.findAllByText("settings.security.offlineToLoad")
    ).toHaveLength(2);
    expect(screen.queryByText("common.loading")).toBeNull();
    expect(fetchAuth).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("shows passkeys but not 2FA for a Google-only account", async () => {
    fetchAuth.mockResolvedValue({
      data: [{ id: "google-account", providerId: "google" }],
      error: null,
    });

    renderSecurity();

    const card = await screen.findByTestId(
      "settings-security-authentication-card"
    );
    expect(within(card).getByTestId("settings-security-passkeys")).toBeTruthy();
    expect(
      within(card).queryByText("settings.security.twoFactorTitle")
    ).toBeNull();
    expect(screen.getByText("settings.security.setPassword")).toBeTruthy();
  });

  it("groups 2FA and passkeys as divided rows", async () => {
    fetchAuth.mockResolvedValue({
      data: [{ id: "credential-account", providerId: "credential" }],
      error: null,
    });

    renderSecurity();

    const card = await screen.findByTestId(
      "settings-security-authentication-card"
    );
    await waitFor(() =>
      expect(
        within(card).getByText("settings.security.twoFactorTitle")
      ).toBeTruthy()
    );
    expect(within(card).getByTestId("settings-security-passkeys")).toBeTruthy();
    expect(card.children).toHaveLength(2);
    expect(card.classList.contains("divide-y")).toBe(true);
  });

  it("offers reauthentication when the session is not fresh", async () => {
    fetchAuth.mockResolvedValue({
      data: [{ id: "credential-account", providerId: "credential" }],
      error: null,
    });
    listSessions.mockResolvedValue({
      data: null,
      error: {
        code: "SESSION_NOT_FRESH",
        message: "Session is not fresh",
      },
    });

    renderSecurity();

    expect(
      await screen.findByText("settings.security.reauthenticationRequired")
    ).toBeTruthy();
    fireEvent.click(screen.getByText("settings.security.signInAgain"));

    expect(navigate).toHaveBeenCalledWith(
      "/auth?redirectTo=%2Fsettings%2Faccount&addAccount=true",
      { state: { email: "writer@example.com" } }
    );
  });
});
