import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionProvider } from "../../region";
import { AuthProvider } from "../context";
import { SsoButtons } from "./sso-buttons";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "auth.continueWithGoogle": "Continue with Google",
          "auth.lastUsed": "Last used",
          "common.error": "Something went wrong",
        }) as const
      )[key as "auth.continueWithGoogle" | "common.error"] ?? key,
  }),
}));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderSsoButtons({
  socialProviders = ["google"],
  getLastUsedLoginMethod = vi.fn((): string | null => null),
  initialEntry = "/auth?region=us",
  socialSignIn = vi.fn().mockResolvedValue({ error: null }),
} = {}) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        apiUrl: "https://api-us.example.com",
        syncUrl: "https://sync-us.example.com",
        regionId: "us",
        storageUrl: "https://storage-us.example.com",
        socialProviders,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
  );

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RegionProvider
        directory={[
          {
            id: "us",
            label: "United States",
            apiUrl: "https://api-us.example.com",
            status: "active",
            default: true,
          },
        ]}
      >
        <AuthProvider
          client={
            {
              getLastUsedLoginMethod,
              signIn: {
                social: socialSignIn,
              },
            } as never
          }
        >
          <SsoButtons />
        </AuthProvider>
      </RegionProvider>
    </MemoryRouter>
  );

  return { socialSignIn };
}

describe("SsoButtons", () => {
  it("hides Google when the server has no enabled social providers", async () => {
    const { socialSignIn } = renderSsoButtons({ socialProviders: [] });
    await waitFor(() =>
      expect(localStorage.getItem("lunaris.regionManifest")).not.toBeNull()
    );
    expect(
      screen.queryByRole("button", { name: "Continue with Google" })
    ).toBeNull();
    expect(socialSignIn).not.toHaveBeenCalled();
  });

  it("badges Google when it was last used", async () => {
    renderSsoButtons({
      getLastUsedLoginMethod: vi.fn(() => "google"),
    });

    const badge = await screen.findByTestId("auth-last-used-google");
    expect(badge.textContent).toBe("Last used");
    expect(badge.className).toContain("top-0");
    expect(badge.className).toContain("-translate-y-1/2");
    await waitFor(() =>
      expect(localStorage.getItem("lunaris.regionManifest")).not.toBeNull()
    );
  });

  it("renders the Google provider button", async () => {
    renderSsoButtons();

    expect(
      await screen.findByRole("button", { name: "Continue with Google" })
    ).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    await waitFor(() =>
      expect(localStorage.getItem("lunaris.regionManifest")).not.toBeNull()
    );
  });

  it("starts Google social sign-in with region in callback", async () => {
    const user = userEvent.setup();
    const { socialSignIn } = renderSsoButtons();

    await user.click(
      await screen.findByRole("button", { name: "Continue with Google" })
    );

    expect(socialSignIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${window.location.origin}/?region=us`,
    });
  });

  it("preserves an intentional add-account callback", async () => {
    const user = userEvent.setup();
    const { socialSignIn } = renderSsoButtons({
      initialEntry:
        "/auth?region=us&addAccount=true&redirectTo=%2Fprevious-organization",
    });

    await user.click(
      await screen.findByRole("button", { name: "Continue with Google" })
    );

    expect(socialSignIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${window.location.origin}/?region=us&redirectTo=%2Fprevious-organization`,
    });
  });

  it("shows loading state and disables all buttons during sign-in", async () => {
    const user = userEvent.setup();
    const socialSignIn = vi.fn(
      () =>
        new Promise<{ error: null }>(() => {
          // Keep pending to assert the interim loading state.
        })
    );

    renderSsoButtons({ socialSignIn });

    await user.click(
      await screen.findByRole("button", { name: "Continue with Google" })
    );

    expect(
      screen
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled"))
    ).toBe(true);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("enables social sign-in on load when config marks a default region", async () => {
    renderSsoButtons({ initialEntry: "/auth" });

    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Continue with Google" })
          .hasAttribute("disabled")
      ).toBe(false)
    );
  });
});
