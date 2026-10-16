/** @vitest-environment happy-dom */

import { createBrowserPlatform, PlatformProvider } from "@repo/platform";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionProvider } from "../../region";
import { AuthProvider } from "../context";
import RegisterPage from "./register";

Object.assign(globalThis, {
  __BUILD_VERSION__: "test-version",
});

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
          "auth.backToSignIn": "Back",
          "auth.email": "Email",
          "auth.haveAccount": "Have an account?",
          "auth.name": "Name",
          "auth.password": "Password",
          "auth.signIn": "Sign in",
          "auth.signUp": "Sign up",
          "auth.signUpDescription": "Create an account",
        }) as const
      )[
        key as
          | "auth.backToSignIn"
          | "auth.email"
          | "auth.haveAccount"
          | "auth.name"
          | "auth.password"
          | "auth.signIn"
          | "auth.signUp"
          | "auth.signUpDescription"
      ] ?? key,
  }),
}));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function renderRegisterPage({
  signupsAllowed = true,
  getSession,
  initialEntry = "/auth/register?region=us",
  onRegistrationCompleted,
  platformOrigin = "https://app.example.com",
  refetchSession = vi.fn().mockResolvedValue(undefined),
  session = null,
  setActiveSession = vi.fn().mockResolvedValue({ error: null }),
  signUpEmail = vi.fn().mockResolvedValue({ error: null }),
}: {
  signupsAllowed?: boolean;
  getSession?: () => {
    user: { emailVerified: boolean; isAnonymous: boolean };
  } | null;
  initialEntry?: string;
  onRegistrationCompleted?: (email: string) => void;
  platformOrigin?: string;
  refetchSession?: ReturnType<typeof vi.fn>;
  session?: {
    user: { emailVerified: boolean; isAnonymous: boolean };
  } | null;
  setActiveSession?: ReturnType<typeof vi.fn>;
  signUpEmail?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        signupsAllowed,
        apiUrl: "https://api-us.example.com",
        syncUrl: "https://sync-us.example.com",
        regionId: "us",
        storageUrl: "https://storage-us.example.com",
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  );
  const platform = createBrowserPlatform({ kind: "web" });
  platform.navigation.origin = () => platformOrigin;

  const createTree = () => (
    <PlatformProvider platform={platform}>
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
                multiSession: {
                  setActive: setActiveSession,
                },
                signUp: {
                  email: signUpEmail,
                },
                useSession: () => ({
                  data: getSession?.() ?? session,
                  refetch: refetchSession,
                }),
              } as never
            }
          >
            <Routes>
              <Route
                element={
                  <RegisterPage
                    onRegistrationCompleted={onRegistrationCompleted}
                  />
                }
                path="/auth/register"
              />
              <Route element={<LocationProbe />} path="*" />
            </Routes>
          </AuthProvider>
        </RegionProvider>
      </MemoryRouter>
    </PlatformProvider>
  );
  const rendered = render(createTree());

  return {
    refetchSession,
    rerender: () => rendered.rerender(createTree()),
    setActiveSession,
    signUpEmail,
  };
}

describe("RegisterPage", () => {
  it("keeps registration open when adding another account", async () => {
    renderRegisterPage({
      initialEntry: "/auth/register?region=us&addAccount=true",
      session: { user: { emailVerified: true, isAnonymous: false } },
    });

    expect(await screen.findByLabelText("Name")).toBeTruthy();
  });

  it("preserves redirect after email signup completes", async () => {
    const user = userEvent.setup();
    const { refetchSession } = renderRegisterPage({
      initialEntry:
        "/auth/register?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify",
    });

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "Ada@Example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/auth/verify-email?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify"
      );
    });
    expect(refetchSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
  });

  it("uses the platform origin for the email signup callback", async () => {
    const user = userEvent.setup();
    const signUpEmail = vi.fn().mockResolvedValue({ error: null });
    renderRegisterPage({
      platformOrigin: "https://desktop.example.com",
      signUpEmail,
    });

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(signUpEmail).toHaveBeenCalledWith({
        callbackURL: "https://desktop.example.com/?region=us",
        email: "ada@example.com",
        name: "Ada Lovelace",
        password: "password123",
      });
    });
  });

  it("activates the claimed session before refreshing an anonymous account", async () => {
    const user = userEvent.setup();
    const signUpEmail = vi.fn().mockResolvedValue({
      data: { token: "claimed-session" },
      error: null,
    });
    const { refetchSession, setActiveSession } = renderRegisterPage({
      session: { user: { emailVerified: false, isAnonymous: true } },
      signUpEmail,
    });

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(setActiveSession).toHaveBeenCalledWith({
        sessionToken: "claimed-session",
      });
    });
    expect(setActiveSession.mock.invocationCallOrder[0]).toBeLessThan(
      refetchSession.mock.invocationCallOrder[0]!
    );
  });

  it("preserves redirect when an unverified signup session resolves", async () => {
    renderRegisterPage({
      initialEntry:
        "/auth/register?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify",
      session: { user: { emailVerified: false, isAnonymous: false } },
    });

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/auth/verify-email?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify"
      );
    });
  });

  it("sends verified sessions to the resolved redirect", async () => {
    renderRegisterPage({
      initialEntry:
        "/auth/register?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify",
      session: { user: { emailVerified: true, isAnonymous: false } },
    });

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/workspaces?tab=recent&region=us#verify"
      );
    });
  });

  it("notifies the composition root after email signup", async () => {
    const user = userEvent.setup();
    const onRegistrationCompleted = vi.fn();
    renderRegisterPage({ onRegistrationCompleted });

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "Ada@Example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() =>
      expect(onRegistrationCompleted).toHaveBeenCalledWith("ada@example.com")
    );
  });

  it("stays mounted while the new session refresh is pending", async () => {
    const user = userEvent.setup();
    let session: {
      user: { emailVerified: boolean; isAnonymous: boolean };
    } | null = null;
    let finishRefetch: (() => void) | undefined;
    const refetchSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefetch = resolve;
        })
    );
    const signUpEmail = vi.fn(async () => {
      session = {
        user: { emailVerified: true, isAnonymous: false },
      };
      return { error: null };
    });
    const { rerender } = renderRegisterPage({
      getSession: () => session,
      refetchSession,
      signUpEmail,
    });

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(refetchSession).toHaveBeenCalledOnce());

    rerender();

    expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();

    finishRefetch?.();
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/auth/verify-email?region=us"
      );
    });
  });
});

it("redirects direct registration to sign-in when signup is disabled", async () => {
  const signUpEmail = vi.fn();
  renderRegisterPage({ signupsAllowed: false, signUpEmail });
  await waitFor(() =>
    expect(screen.getByTestId("location").textContent).toContain("/auth?")
  );
  expect(screen.queryByRole("button", { name: "Sign up" })).toBeNull();
  expect(signUpEmail).not.toHaveBeenCalled();
});
