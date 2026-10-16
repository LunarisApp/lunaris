import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../locale/locales/en.json";
import { RegionProvider } from "../../region";
import { AuthProvider } from "../context";
import { createLogoutNavigationState } from "../redirect";
import SignInPage from "./sign-in";

Object.assign(globalThis, { __BUILD_VERSION__: "test-version" });

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("posthog-js", () => ({ default: { capture } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "auth.continueAsGuest": "Continue as Guest",
          "auth.continueWithEmail": "Continue with Email",
          "auth.continueWithGoogle": "Continue with Google",
          "auth.description": "Pick a sign-in method",
          "auth.registrationDisabled": en.auth.registrationDisabled,
          "auth.email": "Email",
          "auth.lastUsed": "Last used",
          "auth.or": "or",
          "auth.title": "Sign in",
          "common.error": "Something went wrong",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  capture.mockClear();
});

function LocationDisplay() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

function ContinuationDisplay() {
  const location = useLocation();
  return <div>{JSON.stringify(location.state)}</div>;
}

function renderSignInPage({
  signupsAllowed = true,
  anonymousSignIn = vi.fn().mockResolvedValue({ error: null }),
  getLastUsedLoginMethod = vi.fn((): string | null => null),
  initialEntry = "/auth?region=us",
  onAnonymousSessionCreated,
  passkeySignIn = vi.fn().mockResolvedValue({ error: null }),
  passkeysSupported = false,
  resolveEmailMethod = vi.fn().mockResolvedValue({
    data: { kind: "password" },
    error: null,
  }),
  session = null,
  socialSignIn = vi.fn().mockResolvedValue({ error: null }),
}: {
  signupsAllowed?: boolean;
  anonymousSignIn?: ReturnType<typeof vi.fn>;
  getLastUsedLoginMethod?: ReturnType<typeof vi.fn>;
  initialEntry?:
    | string
    | { pathname: string; search?: string; state?: unknown };
  onAnonymousSessionCreated?: () => void;
  passkeySignIn?: ReturnType<typeof vi.fn>;
  passkeysSupported?: boolean;
  resolveEmailMethod?: ReturnType<typeof vi.fn>;
  session?: { user: { id: string } } | null;
  socialSignIn?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        apiUrl: "https://api-us.example.com",
        syncUrl: "https://sync-us.example.com",
        regionId: "us",
        storageUrl: "https://storage-us.example.com",
        socialProviders: ["google"],
        signupsAllowed,
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );

  const rendered = render(
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
          {
            id: "eu",
            label: "Europe",
            apiUrl: "https://api-eu.example.com",
            status: "coming-soon",
          },
        ]}
      >
        <AuthProvider
          client={
            {
              getLastUsedLoginMethod,
              resolveEmailMethod,
              signIn: {
                anonymous: anonymousSignIn,
                passkey: passkeySignIn,
                social: socialSignIn,
              },
              supportsPasskeys: () => passkeysSupported,
              useSession: () => ({ data: session }),
            } as never
          }
        >
          <Routes>
            <Route
              element={
                <>
                  <SignInPage
                    onAnonymousSessionCreated={onAnonymousSessionCreated}
                  />
                  <LocationDisplay />
                </>
              }
              path="/auth"
            />
            <Route
              element={<ContinuationDisplay />}
              path="/auth/continue"
            />
            <Route element={<LocationDisplay />} path="*" />
          </Routes>
        </AuthProvider>
      </RegionProvider>
    </MemoryRouter>,
  );

  return {
    ...rendered,
    anonymousSignIn,
    getLastUsedLoginMethod,
    passkeySignIn,
    resolveEmailMethod,
    socialSignIn,
  };
}

function enableConditionalPasskeys(available = true) {
  class MockPublicKeyCredential {
    static isConditionalMediationAvailable = vi
      .fn()
      .mockResolvedValue(available);
  }
  vi.stubGlobal("PublicKeyCredential", MockPublicKeyCredential);
}

describe("SignInPage", () => {
  it("keeps sign-in open when adding another account", async () => {
    renderSignInPage({
      initialEntry: "/auth?region=us&addAccount=true",
      session: { user: { id: "current-user" } },
    });

    expect(
      await screen.findByRole("button", { name: "Continue as Guest" }),
    ).toBeTruthy();
  });

  it("routes an added guest through its own account state", async () => {
    const user = userEvent.setup();
    const anonymousSignIn = vi.fn().mockResolvedValue({
      data: { user: { id: "guest-user" } },
      error: null,
    });
    renderSignInPage({
      anonymousSignIn,
      initialEntry: "/auth?region=us&addAccount=true",
      session: { user: { id: "current-user" } },
    });

    await user.click(screen.getByRole("button", { name: "Continue as Guest" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/");
      expect(screen.getByTestId("location-state").textContent).toBe(
        JSON.stringify({ accountSwitchTargetUserId: "guest-user" }),
      );
    });
  });

  it("keeps sign-in open while logout clears a cached session", async () => {
    renderSignInPage({
      initialEntry: {
        pathname: "/auth",
        search: "?region=us",
        state: createLogoutNavigationState(),
      },
      session: { user: { id: "logging-out-user" } },
    });

    expect(
      await screen.findByRole("button", { name: "Continue as Guest" }),
    ).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/auth");
  });

  it("clears logout navigation state after the session disappears", async () => {
    renderSignInPage({
      initialEntry: {
        pathname: "/auth",
        search: "?region=us",
        state: createLogoutNavigationState(),
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId("location-state").textContent).toBe("null"),
    );
  });

  it("badges Email when it was last used", async () => {
    renderSignInPage({
      getLastUsedLoginMethod: vi.fn(() => "email"),
    });

    const badge = await screen.findByTestId("auth-last-used-email");
    expect(badge.textContent).toBe("Last used");
    expect(badge.className).toContain("top-0");
    expect(badge.className).toContain("-translate-y-1/2");
    expect(screen.queryByTestId("auth-last-used-google")).toBeNull();
    await waitFor(() =>
      expect(localStorage.getItem("lunaris.regionManifest")).not.toBeNull(),
    );
  });

  it.each(["anonymous", "passkey", null])(
    "does not badge hidden method %s",
    async (method) => {
      renderSignInPage({
        getLastUsedLoginMethod: vi.fn(() => method),
      });

      await screen.findByRole("button", { name: "Continue as Guest" });
      expect(screen.queryByTestId("auth-last-used-email")).toBeNull();
      expect(screen.queryByTestId("auth-last-used-google")).toBeNull();
      await waitFor(() =>
        expect(localStorage.getItem("lunaris.regionManifest")).not.toBeNull(),
      );
    },
  );

  it("orders Google, email, divider, then Guest", async () => {
    renderSignInPage();

    await screen.findByRole("button", {
      name: "Continue as Guest",
    });
    const google = await screen.findByRole("button", {
      name: "Continue with Google",
    });
    const email = screen.getByRole("textbox", { name: "Email" });
    const divider = screen.getByTestId("auth-entry-divider");
    const providerGroup = google.parentElement!;
    const emailForm = email.closest("form")!;
    const methodGroup = emailForm.parentElement!;

    expect(
      providerGroup.nextElementSibling?.querySelector(
        '[data-testid="auth-entry-email"]',
      ),
    ).not.toBeNull();
    expect(methodGroup.nextElementSibling?.getAttribute("data-testid")).toBe(
      "auth-entry-divider",
    );
    expect(divider.nextElementSibling?.getAttribute("data-testid")).toBe(
      "auth-entry-guest",
    );
    expect(screen.getByText("or")).toBeTruthy();
    expect(email.getAttribute("autocomplete")).toBe("username webauthn");
    expect(screen.getByText("Email").className).toContain("sr-only");
    expect(screen.queryByTestId("auth-entry-passkey")).toBeNull();
  });

  it("resolves an email and navigates with continuation state", async () => {
    const user = userEvent.setup();
    const { resolveEmailMethod } = renderSignInPage({
      initialEntry:
        "/auth?region=us&redirectTo=%2Fsettings%2Faccount",
    });

    await user.type(screen.getByRole("textbox", { name: "Email" }), "USER@EXAMPLE.COM");
    await user.click(
      screen.getByRole("button", { name: "Continue with Email" }),
    );

    expect(resolveEmailMethod).toHaveBeenCalledWith("user@example.com");
    expect(
      await screen.findByText(
        JSON.stringify({
          email: "user@example.com",
          resolution: { kind: "password" },
        }),
      ),
    ).toBeTruthy();
  });

  it("resolves an email once when Enter is pressed", async () => {
    const user = userEvent.setup();
    const { resolveEmailMethod } = renderSignInPage();

    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "USER@EXAMPLE.COM{Enter}",
    );

    await waitFor(() => expect(resolveEmailMethod).toHaveBeenCalledOnce());
    expect(resolveEmailMethod).toHaveBeenCalledWith("user@example.com");
    expect(
      await screen.findByText(
        JSON.stringify({
          email: "user@example.com",
          resolution: { kind: "password" },
        }),
      ),
    ).toBeTruthy();
  });

  it("associates validation errors with the email field", async () => {
    const user = userEvent.setup();
    renderSignInPage();

    const email = screen.getByRole("textbox", { name: "Email" });
    await user.type(email, "invalid");

    const error = await screen.findByRole("alert");
    expect(error.id).toBe("auth-email-error");
    expect(email.getAttribute("aria-describedby")).toBe(error.id);
    expect(email.getAttribute("aria-invalid")).toBe("true");
  });

  it("disables competing actions while Google redirects", async () => {
    const user = userEvent.setup();
    const socialSignIn = vi.fn(
      () => new Promise<{ error: null }>(() => undefined),
    );
    renderSignInPage({ socialSignIn });

    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(
      (screen.getByRole("button", {
        name: "Continue as Guest",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it("notifies the composition root after guest sign-in", async () => {
    const user = userEvent.setup();
    const onAnonymousSessionCreated = vi.fn();
    renderSignInPage({ onAnonymousSessionCreated });

    await user.click(screen.getByRole("button", { name: "Continue as Guest" }));

    expect(onAnonymousSessionCreated).toHaveBeenCalledOnce();
  });

  it("preloads conditional passkeys and preserves redirect on success", async () => {
    enableConditionalPasskeys();
    const passkeySignIn = vi.fn().mockResolvedValue({ error: null });
    renderSignInPage({
      initialEntry:
        "/auth?region=us&redirectTo=%2Fsettings%2Faccount",
      passkeySignIn,
      passkeysSupported: true,
    });

    await waitFor(() => {
      expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true });
    });
    expect(await screen.findByText("/settings/account")).toBeTruthy();
    expect(capture).toHaveBeenCalledWith("auth_sign_in", {
      method: "passkey",
    });
  });

  it("routes an added passkey account through its own account state", async () => {
    enableConditionalPasskeys();
    const passkeySignIn = vi.fn().mockResolvedValue({
      data: { user: { id: "passkey-user" } },
      error: null,
    });
    renderSignInPage({
      initialEntry: "/auth?region=us&addAccount=true",
      passkeySignIn,
      passkeysSupported: true,
      session: { user: { id: "current-user" } },
    });

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/");
      expect(screen.getByTestId("location-state").textContent).toBe(
        JSON.stringify({ accountSwitchTargetUserId: "passkey-user" }),
      );
    });
  });

  it("keeps explicit methods enabled while conditional passkey waits", async () => {
    enableConditionalPasskeys();
    const passkeySignIn = vi.fn(
      () => new Promise<{ error: null }>(() => undefined),
    );
    renderSignInPage({ passkeySignIn, passkeysSupported: true });

    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledOnce());
    expect(
      (screen.getByRole("button", {
        name: "Continue as Guest",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });

});


it("hides server guest creation when signup is disabled but keeps existing login methods", async () => {
  renderSignInPage({ signupsAllowed: false });
  await screen.findByText("Registration is disabled on this server. Sign in with an existing account.");
  expect(screen.queryByTestId("auth-entry-guest")).toBeNull();
  expect(screen.queryByTestId("auth-entry-divider")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Email" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
});


it("reports a guest network failure and lets the user retry", async () => {
  const anonymousSignIn = vi.fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ error: null });
  const onAnonymousSessionCreated = vi.fn();
  renderSignInPage({ anonymousSignIn, onAnonymousSessionCreated });
  const guestButton = await screen.findByRole("button", { name: "Continue as Guest" });
  await waitFor(() => expect(guestButton.hasAttribute("disabled")).toBe(false));
  await userEvent.click(guestButton);
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(capture).toHaveBeenCalledWith("auth_sign_in_failed", { method: "anonymous" });
  expect(onAnonymousSessionCreated).not.toHaveBeenCalled();
  expect(guestButton.hasAttribute("disabled")).toBe(false);
  await userEvent.click(guestButton);
  await waitFor(() => expect(onAnonymousSessionCreated).toHaveBeenCalledOnce());
  expect(anonymousSignIn).toHaveBeenCalledTimes(2);
});
