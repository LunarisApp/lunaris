import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  capture,
  captureException,
  authRedirect,
  verifyBackupCode,
  verifyTotp,
} = vi.hoisted(() => ({
  authRedirect: {
    isAddingAccount: false,
    pathWithRedirect: (path: string) => path,
    resolvedRedirectTo: "/organization",
  },
  capture: vi.fn(),
  captureException: vi.fn(),
  verifyBackupCode: vi.fn(),
  verifyTotp: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { capture, captureException },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: { ...actual.log, error: vi.fn() },
    parseError: (error: unknown) => error,
  };
});

vi.mock("../components/auth-layout", () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("../context", () => ({
  useAuth: () => ({
    twoFactor: {
      verifyBackupCode,
      verifyTotp,
    },
    useSession: () => ({ data: null }),
  }),
}));

vi.mock("../redirect", () => ({
  createAccountSwitchNavigationState: (userId: string) => ({
    accountSwitchTargetUserId: userId,
  }),
  useAuthRedirect: () => authRedirect,
}));

import TwoFactorPage from "./two-factor";

beforeEach(() => {
  authRedirect.isAddingAccount = false;
  capture.mockClear();
  captureException.mockClear();
  verifyBackupCode.mockReset();
  verifyTotp.mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/auth/two-factor"]}>
      <Routes>
        <Route element={<TwoFactorPage />} path="/auth/two-factor" />
        <Route element={<LocationProbe />} path="/organization" />
      </Routes>
    </MemoryRouter>
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <p>organization</p>
      <p data-testid="location-state">{JSON.stringify(location.state)}</p>
    </>
  );
}

describe("TwoFactorPage", () => {
  it("verifies an authenticator code and can trust the device", async () => {
    const user = userEvent.setup();
    verifyTotp.mockResolvedValue({ data: { status: true }, error: null });
    renderPage();

    await user.type(screen.getByLabelText("auth.authenticatorCode"), "123456");
    await user.click(screen.getByText("auth.trustDevice"));
    await user.click(screen.getByText("auth.verify"));

    await waitFor(() =>
      expect(verifyTotp).toHaveBeenCalledWith({
        code: "123456",
        trustDevice: true,
      })
    );
    expect(await screen.findByText("organization")).toBeTruthy();
  });

  it("supports account recovery with a backup code", async () => {
    const user = userEvent.setup();
    verifyBackupCode.mockResolvedValue({ data: { status: true }, error: null });
    renderPage();

    await user.click(screen.getByText("auth.useBackupCode"));
    await user.type(screen.getByLabelText("auth.backupCode"), "amber-forest");
    await user.click(screen.getByText("auth.verify"));

    await waitFor(() =>
      expect(verifyBackupCode).toHaveBeenCalledWith({
        code: "amber-forest",
        disableSession: false,
        trustDevice: false,
      })
    );
  });

  it("routes an added 2FA account through its own account state", async () => {
    const user = userEvent.setup();
    authRedirect.isAddingAccount = true;
    verifyTotp.mockResolvedValue({
      data: { user: { id: "two-factor-user" } },
      error: null,
    });
    renderPage();

    await user.type(screen.getByLabelText("auth.authenticatorCode"), "123456");
    await user.click(screen.getByText("auth.verify"));

    expect((await screen.findByTestId("location-state")).textContent).toBe(
      JSON.stringify({ accountSwitchTargetUserId: "two-factor-user" })
    );
  });
});
