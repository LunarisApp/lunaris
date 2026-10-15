import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionProvider } from "../../region";
import { AuthProvider } from "../context";
import ContinuePage from "./continue";

Object.assign(globalThis, { __BUILD_VERSION__: "test-version" });

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "auth.backToSignIn": "Back",
          "auth.changeEmail": "Change",
          "auth.continueWithGoogle": "Continue with Google",
          "auth.description": "Sign in",
          "auth.email": "Email",
          "auth.forgotPassword": "Forgot password?",
          "auth.googleAccountDescription": "This email uses Google.",
          "auth.name": "Name",
          "auth.password": "Password",
          "auth.signIn": "Sign in",
          "auth.signUp": "Sign up",
          "auth.signUpDescription": "Create an account",
          "auth.title": "Welcome",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderContinuation(
  state: unknown,
  client: Record<string, unknown> = {},
  search = "?region=us",
  signupsAllowed = true,
) {
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

  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/auth/continue",
          search,
          state,
        },
      ]}
    >
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
              signIn: {
                email: vi.fn().mockResolvedValue({ data: {}, error: null }),
                social: vi.fn().mockResolvedValue({ error: null }),
              },
              signUp: {
                email: vi.fn().mockResolvedValue({ error: null }),
              },
              useSession: () => ({
                data: null,
                refetch: vi.fn().mockResolvedValue(undefined),
              }),
              ...client,
            } as never
          }
        >
          <Routes>
            <Route element={<ContinuePage />} path="/auth/continue" />
            <Route element={<div>Root auth</div>} path="/auth" />
            <Route element={<LocationProbe />} path="*" />
          </Routes>
        </AuthProvider>
      </RegionProvider>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {JSON.stringify({
        pathname: location.pathname,
        state: location.state,
      })}
    </div>
  );
}

describe("ContinuePage", () => {
  it("shows password entry for a credential account", async () => {
    const user = userEvent.setup();
    const emailSignIn = vi.fn().mockResolvedValue({ data: {}, error: null });
    renderContinuation(
      {
        email: "writer@example.com",
        resolution: { kind: "password" },
      },
      { signIn: { email: emailSignIn, social: vi.fn() } },
    );

    expect(screen.getByText("writer@example.com")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
    const password = screen.getByLabelText("Password");
    expect(document.activeElement).toBe(password);
    await user.type(password, "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(emailSignIn).toHaveBeenCalledWith({
      email: "writer@example.com",
      password: "password123",
    });
  });

  it("routes an added email account through its own account state", async () => {
    const user = userEvent.setup();
    const emailSignIn = vi.fn().mockResolvedValue({
      data: { user: { id: "email-user" } },
      error: null,
    });
    renderContinuation(
      {
        email: "writer@example.com",
        resolution: { kind: "password" },
      },
      { signIn: { email: emailSignIn, social: vi.fn() } },
      "?region=us&addAccount=true&redirectTo=%2Fauth%2Faccept-invitation%3FinvitationId%3Dinvite-1",
    );

    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByTestId("location")).textContent).toBe(
      JSON.stringify({
        pathname: "/auth/accept-invitation",
        state: { accountSwitchTargetUserId: "email-user" },
      }),
    );
  });

  it("shows registration fields for an unknown email", async () => {
    renderContinuation({
      email: "new@example.com",
      resolution: { kind: "register" },
    });

    expect(screen.getByText("Email")).toBeTruthy();
    expect(await screen.findByText("new@example.com")).toBeTruthy();
    const email = screen.getByText("new@example.com");
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(email.compareDocumentPosition(name)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
  });

  it("prompts Google for a Google-only account", async () => {
    renderContinuation({
      email: "google@example.com",
      resolution: { kind: "social", provider: "google" },
    });

    expect(await screen.findByText("google@example.com")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Continue with Google" }),
    ).toBeTruthy();
  });

  it("returns invalid continuation state to root", async () => {
    renderContinuation({ email: "invalid" });

    expect(await screen.findByText("Root auth")).toBeTruthy();
  });
});


it("hides the signup link on password entry when registration is closed", async () => {
  renderContinuation({ email: "writer@example.com", resolution: { kind: "password" } }, {}, "?region=us", false);
  await screen.findByRole("button", { name: "Sign in" });
  expect(screen.queryByRole("link", { name: "Sign up" })).toBeNull();
});
