/** @vitest-environment happy-dom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context";
import AcceptInvitationPage from "./accept-invitation";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) =>
      path.includes("?") ? `${path}&region=us` : `${path}?region=us`,
    region: { id: "us" },
    selectionRequired: false,
    urlWithRegion: (url: string) => url,
  }),
}));

vi.mock("../redirect", () => ({
  buildAddAccountPath: (authPath: string) =>
    `${authPath}&redirectTo=%2Fauth%2Faccept-invitation%3Fregion%3Dus%26invitationId%3Dinvite_1&addAccount=true`,
  buildAuthRedirectPath: (authPath: string) =>
    `${authPath}&redirectTo=%2Fauth%2Faccept-invitation%3Fregion%3Dus%26invitationId%3Dinvite_1`,
}));

vi.mock("../components/auth-layout", () => ({
  AuthLayout: ({
    children,
    description,
    title,
  }: {
    children: ReactNode;
    description: string;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      (
        {
          "auth.acceptInvitation": "Accept invitation",
          "auth.acceptInvitationCta": "Accept invitation",
          "auth.acceptInvitationDescription": `Join ${values?.organization ?? ""} on Lunaris as ${values?.role ?? ""} with ${values?.email ?? ""}.`,
          "auth.acceptInvitationSuccess": "Invitation accepted",
          "auth.invitationEmailMismatch":
            "Sign in with the invited email address to accept this organization invitation.",
          "auth.invitationNeedsVerification":
            "Verify your email before accepting this organization invitation.",
          "auth.invitationNotFound": "Invitation unavailable",
          "auth.invitationNotFoundDescription":
            "This invitation is missing, expired, or already used.",
          "auth.switchAccount": "Switch account",
          "auth.verifyEmail": "Verify your email",
          "common.error": "Something went wrong",
          "common.loading": "Loading",
          "errors.reason.auth.organizationMemberLimit.title":
            "Organization member limit reached",
          "errors.reason.auth.organizationMemberLimit.desc":
            "Upgrade this organization to add more members.",
        } as const
      )[key as
        | "auth.acceptInvitation"
        | "auth.acceptInvitationCta"
        | "auth.acceptInvitationDescription"
        | "auth.acceptInvitationSuccess"
        | "auth.invitationEmailMismatch"
        | "auth.invitationNeedsVerification"
        | "auth.invitationNotFound"
        | "auth.invitationNotFoundDescription"
        | "auth.switchAccount"
        | "auth.verifyEmail"
        | "common.error"
        | "common.loading"
        | "errors.reason.auth.organizationMemberLimit.title"
        | "errors.reason.auth.organizationMemberLimit.desc"] ?? key,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function LocationDisplay() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

function renderPage({
  initialEntry = "/auth/accept-invitation?region=us&invitationId=invite_1",
  session = null,
  getInvitation = vi.fn().mockResolvedValue({
    data: {
      email: "teammate@example.com",
      id: "invite_1",
      organizationName: "Alpha Space",
      organizationSlug: "alpha-space",
      role: "viewer",
    },
    error: null,
  }),
  acceptInvitation = vi.fn().mockResolvedValue({ error: null }),
  signOut = vi.fn().mockResolvedValue(undefined),
}: {
  acceptInvitation?: ReturnType<typeof vi.fn>;
  getInvitation?: ReturnType<typeof vi.fn>;
  initialEntry?: string;
  session?: {
    user: {
      emailVerified: boolean;
      isAnonymous: boolean;
    };
  } | null;
  signOut?: ReturnType<typeof vi.fn>;
} = {}) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider
        client={
          {
            organization: {
              acceptInvitation,
              getInvitation,
            },
            signOut,
            useSession: () => ({ data: session, isPending: false }),
          } as never
        }
      >
        <Routes>
          <Route element={<AcceptInvitationPage />} path="/auth/accept-invitation" />
          <Route element={<div>Auth Page</div>} path="/auth" />
          <Route element={<div>Verify Page</div>} path="/auth/verify-email" />
          <Route element={<div>Invited Organization</div>} path="/alpha-space" />
        </Routes>
        <LocationDisplay />
      </AuthProvider>
    </MemoryRouter>
  );

  return { acceptInvitation, getInvitation, signOut };
}

describe("AcceptInvitationPage", () => {
  it("redirects unauthenticated users to auth with redirectTo", () => {
    renderPage({ session: null });

    expect(screen.getByText("Auth Page")).toBeTruthy();
    expect(
      screen.getByText(
        "/auth?region=us&redirectTo=%2Fauth%2Faccept-invitation%3Fregion%3Dus%26invitationId%3Dinvite_1",
      ),
    ).toBeTruthy();
  });

  it("shows mismatch state when signed in with wrong account", async () => {
    renderPage({
      getInvitation: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
          status: 403,
        },
      }),
      session: {
        user: {
          emailVerified: true,
          isAnonymous: false,
        },
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Sign in with the invited email address to accept this organization invitation."
        )
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Switch account" })).toBeTruthy();
    });
  });

  it("keeps existing sessions when switching accounts", async () => {
    const user = userEvent.setup();
    const { signOut } = renderPage({
      getInvitation: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
          status: 403,
        },
      }),
      session: {
        user: {
          emailVerified: true,
          isAnonymous: false,
        },
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "Switch account" }),
    );

    expect(await screen.findByText("Auth Page")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "/auth?region=us&redirectTo=%2Fauth%2Faccept-invitation%3Fregion%3Dus%26invitationId%3Dinvite_1&addAccount=true",
      ),
    ).toBeTruthy();
  });

  it("shows email verification instead of an account mismatch", async () => {
    const user = userEvent.setup();
    renderPage({
      getInvitation: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION",
          status: 403,
        },
      }),
      session: {
        user: {
          emailVerified: false,
          isAnonymous: false,
        },
      },
    });

    expect(
      await screen.findByText(
        "Verify your email before accepting this organization invitation.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch account" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Verify your email" }));
    expect(await screen.findByText("Verify Page")).toBeTruthy();
  });

  it("accepts invitation and navigates to its organization", async () => {
    const user = userEvent.setup();
    const { acceptInvitation } = renderPage({
      session: {
        user: {
          emailVerified: true,
          isAnonymous: false,
        },
      },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Accept invitation" })
      ).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith({
        invitationId: "invite_1",
      });
      expect(screen.getByText("Invited Organization")).toBeTruthy();
      expect(screen.getByText("/alpha-space?region=us")).toBeTruthy();
    });
  });

  it("shows member-limit error when an organization is full", async () => {
    const user = userEvent.setup();
    const acceptInvitation = vi.fn().mockResolvedValue({
      error: {
        code: "ORGANIZATION_MEMBER_LIMIT_REACHED",
        message: "Organization member limit reached.",
        status: 403,
      },
    });

    renderPage({
      acceptInvitation,
      session: {
        user: {
          emailVerified: true,
          isAnonymous: false,
        },
      },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Accept invitation" })
      ).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Organization member limit reached",
        {
          description: "Upgrade this organization to add more members.",
        }
      );
      expect(screen.queryByText("Invited Organization")).toBeNull();
      expect(
        screen.getByText("/auth/accept-invitation?region=us&invitationId=invite_1")
      ).toBeTruthy();
    });
  });
});
