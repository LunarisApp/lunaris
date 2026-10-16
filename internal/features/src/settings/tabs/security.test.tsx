import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  capture,
  captureException,
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  generateBackupCodes,
  linkSocial,
  refetchSession,
  setPassword,
  toastError,
  toastSuccess,
  verifyTotp,
} = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  changePassword: vi.fn(),
  disableTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  generateBackupCodes: vi.fn(),
  linkSocial: vi.fn(),
  refetchSession: vi.fn(),
  setPassword: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  verifyTotp: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { capture, captureException },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-router", () => ({
  useLocation: () => ({ hash: "", pathname: "/settings/account", search: "" }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: { ...actual.log, error: vi.fn() },
    parseError: (error: unknown) => error,
  };
});

vi.mock("../../auth", () => ({
  useAuth: () => ({
    $fetch: setPassword,
    changePassword,
    linkSocial,
    useSession: () => ({ refetch: refetchSession }),
    twoFactor: {
      disable: disableTwoFactor,
      enable: enableTwoFactor,
      generateBackupCodes,
      verifyTotp,
    },
  }),
}));

vi.mock("../../region", () => ({
  useRegion: () => ({
    authUrl: (path: string) => `lunaris://${path}`,
    pathWithRegion: (path: string) => `${path}?region=eu`,
  }),
}));

import {
  GoogleAccountSection,
  PasswordSection,
  TwoFactorSection,
} from "./security";

beforeEach(() => {
  capture.mockClear();
  captureException.mockClear();
  changePassword.mockReset();
  disableTwoFactor.mockReset();
  enableTwoFactor.mockReset();
  generateBackupCodes.mockReset();
  linkSocial.mockReset();
  refetchSession.mockReset();
  setPassword.mockReset();
  toastError.mockClear();
  toastSuccess.mockClear();
  verifyTotp.mockReset();
});

describe("PasswordSection", () => {
  it("keeps password fields in a dialog and resets after changing password", async () => {
    const user = userEvent.setup();
    changePassword.mockResolvedValue({ data: { status: true }, error: null });

    render(<PasswordSection hasPassword />);

    expect(
      screen.queryByLabelText("settings.security.currentPassword")
    ).toBeNull();
    await user.click(screen.getByText("settings.security.changePassword"));

    const dialog = await screen.findByTestId("change-password-dialog");
    const submit = within(dialog)
      .getByTestId("settings-security-change-password-submit")
      .closest("button")!;
    expect(submit.disabled).toBe(true);

    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "current password"
    );
    await user.type(
      within(dialog).getByLabelText("settings.security.newPassword"),
      "new secure password"
    );
    await user.type(
      within(dialog).getByLabelText("settings.security.confirmPassword"),
      "different password"
    );
    expect(
      within(dialog).getByText("settings.security.passwordMismatch")
    ).toBeTruthy();
    expect(submit.disabled).toBe(true);

    await user.clear(
      within(dialog).getByLabelText("settings.security.confirmPassword")
    );
    await user.type(
      within(dialog).getByLabelText("settings.security.confirmPassword"),
      "new secure password"
    );
    await user.click(submit);

    await waitFor(() =>
      expect(screen.queryByTestId("change-password-dialog")).toBeNull()
    );
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "current password",
      newPassword: "new secure password",
    });
    expect(capture).toHaveBeenCalledWith("password_changed");
    expect(toastSuccess).toHaveBeenCalledWith(
      "settings.security.passwordChanged"
    );

    await user.click(screen.getByText("settings.security.changePassword"));
    const reopenedDialog = await screen.findByTestId("change-password-dialog");
    expect(
      (
        within(reopenedDialog).getByLabelText(
          "settings.security.currentPassword"
        ) as HTMLInputElement
      ).value
    ).toBe("");
    expect(
      (
        within(reopenedDialog).getByLabelText(
          "settings.security.newPassword"
        ) as HTMLInputElement
      ).value
    ).toBe("");
  }, 10_000);

  it("keeps change-password dialog open after an API error", async () => {
    const user = userEvent.setup();
    changePassword.mockResolvedValue({
      data: null,
      error: { message: "invalid password" },
    });

    render(<PasswordSection hasPassword />);
    await user.click(screen.getByText("settings.security.changePassword"));
    const dialog = await screen.findByTestId("change-password-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "wrong password"
    );
    await user.type(
      within(dialog).getByLabelText("settings.security.newPassword"),
      "new secure password"
    );
    await user.type(
      within(dialog).getByLabelText("settings.security.confirmPassword"),
      "new secure password"
    );
    await user.click(
      within(dialog).getByTestId("settings-security-change-password-submit")
    );

    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("change-password-dialog")).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalledWith(
      "settings.security.passwordChanged"
    );
  });

  it("sets an initial password in a dialog and reports completion", async () => {
    const user = userEvent.setup();
    const onPasswordSet = vi.fn();
    setPassword.mockResolvedValue({ data: { status: true }, error: null });

    render(
      <PasswordSection hasPassword={false} onPasswordSet={onPasswordSet} />
    );

    expect(screen.queryByLabelText("settings.security.newPassword")).toBeNull();
    await user.click(screen.getByText("settings.security.setPassword"));
    const dialog = await screen.findByTestId("set-password-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.newPassword"),
      "new secure password"
    );
    await user.type(
      within(dialog).getByLabelText("settings.security.confirmPassword"),
      "new secure password"
    );
    await user.click(
      within(dialog).getByTestId("settings-security-set-password-submit")
    );

    await waitFor(() =>
      expect(screen.queryByTestId("set-password-dialog")).toBeNull()
    );
    expect(setPassword).toHaveBeenCalledWith("/set-password", {
      body: { newPassword: "new secure password" },
      method: "POST",
    });
    expect(onPasswordSet).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("password_set");
    expect(toastSuccess).toHaveBeenCalledWith("settings.security.passwordSet");
  });
});

async function connect(
  onRefresh: () => Promise<{ id: string; providerId: string }[]>
) {
  const user = userEvent.setup();
  render(
    <GoogleAccountSection accounts={[]} loading={false} onRefresh={onRefresh} />
  );
  await user.click(screen.getByText("settings.security.connectGoogle"));
  await waitFor(() =>
    expect(screen.getByText("settings.security.connectGoogle")).toBeTruthy()
  );
}

describe("GoogleAccountSection", () => {
  it("confirms refreshed Google account before reporting success", async () => {
    linkSocial.mockResolvedValue({ error: null });
    const onRefresh = vi.fn(async () => [
      { id: "google-account", providerId: "google" },
    ]);

    await connect(onRefresh);

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("google_account_linked");
    expect(toastSuccess).toHaveBeenCalledWith(
      "settings.security.googleConnected"
    );
    expect(linkSocial).toHaveBeenCalledWith({
      callbackURL: "lunaris:///auth?region=eu&redirectTo=%2Fsettings%2Faccount",
      provider: "google",
    });
  });

  it.each([
    {
      name: "API error",
      result: { error: { message: "denied" } },
      refresh: async () => [{ id: "google-account", providerId: "google" }],
    },
    {
      name: "thrown callback",
      result: new Error("callback failed"),
      refresh: async () => [{ id: "google-account", providerId: "google" }],
    },
    {
      name: "refresh failure",
      result: { error: null },
      refresh: async () => {
        throw new Error("refresh failed");
      },
    },
    {
      name: "missing Google account",
      result: { error: null },
      refresh: async () => [
        { id: "credential-account", providerId: "credential" },
      ],
    },
  ])("clears pending state after $name", async ({ result, refresh }) => {
    if (result instanceof Error) {
      linkSocial.mockRejectedValue(result);
    } else {
      linkSocial.mockResolvedValue(result);
    }

    await connect(refresh);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("settings.security.connectGoogle")).toBeTruthy();
  });
});

describe("TwoFactorSection", () => {
  it("keeps setup in a dialog and reveals backup codes only after verification", async () => {
    const user = userEvent.setup();
    enableTwoFactor.mockResolvedValue({
      data: {
        backupCodes: ["amber-forest", "quiet-river"],
        totpURI:
          "otpauth://totp/Lunaris:test@example.com?secret=ABCDEF&issuer=Lunaris",
      },
      error: null,
    });
    verifyTotp.mockResolvedValue({ data: { status: true }, error: null });

    render(<TwoFactorSection enabled={false} />);

    expect(
      screen.queryByLabelText("settings.security.currentPassword")
    ).toBeNull();
    await user.click(screen.getByText("settings.security.setUpTwoFactor"));
    const dialog = await screen.findByTestId("two-factor-setup-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "correct horse battery staple"
    );
    await user.click(within(dialog).getByText("common.continue"));

    expect(
      await within(dialog).findByRole("img", {
        name: "settings.security.twoFactorQrLabel",
      })
    ).toBeTruthy();
    expect(
      within(dialog)
        .getByText(/settings\.security\.twoFactorStepAuthenticator/)
        .closest("li")
        ?.getAttribute("aria-current")
    ).toBe("step");
    expect(
      within(dialog).getByText("settings.security.twoFactorScanQrTitle")
    ).toBeTruthy();
    expect(
      within(dialog).getByText("settings.security.twoFactorVerificationTitle")
    ).toBeTruthy();
    expect(
      dialog.querySelectorAll('[data-slot="input-otp-slot"]')
    ).toHaveLength(6);
    const setupKey = within(dialog).getByText("ABCDEF");
    expect(setupKey.tagName).toBe("PRE");
    expect(setupKey.classList.contains("min-w-0")).toBe(true);
    expect(setupKey.classList.contains("overflow-x-auto")).toBe(true);
    expect(setupKey.classList.contains("whitespace-pre")).toBe(true);
    expect(
      dialog
        .querySelector(".overflow-y-auto")
        ?.classList.contains("overflow-x-hidden")
    ).toBe(true);
    expect(
      dialog
        .querySelector("#two-factor-verify-form")
        ?.classList.contains("px-2")
    ).toBe(true);
    expect(within(dialog).queryByText("amber-forest")).toBeNull();

    await user.click(
      within(dialog).getByText("settings.security.copySetupKey")
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      "settings.security.setupKeyCopied"
    );

    const verifyButton = within(dialog).getByText(
      "settings.security.verifyAndEnable"
    );
    expect(verifyButton.closest("button")?.disabled).toBe(true);
    await user.type(
      within(dialog).getByLabelText("settings.security.authenticatorCode"),
      "123456"
    );
    await user.click(verifyButton);

    await waitFor(() =>
      expect(verifyTotp).toHaveBeenCalledWith(
        { code: "123456" },
        { disableSignal: true }
      )
    );
    expect(await within(dialog).findByText("amber-forest")).toBeTruthy();
    expect(capture).toHaveBeenCalledWith("two_factor_enabled");
    expect(refetchSession).not.toHaveBeenCalled();
    expect(
      screen.getByText("settings.security.twoFactorDisabled")
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("two-factor-setup-dialog")).toBeTruthy();
    await user.click(
      within(dialog).getByText("settings.security.copyBackupCodes")
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      "settings.security.backupCodesCopied"
    );

    const done = within(dialog).getByText("common.done").closest("button");
    expect(done?.disabled).toBe(true);
    await user.click(
      within(dialog).getByText("settings.security.savedBackupCodes")
    );
    expect(done?.disabled).toBe(false);
    await user.click(done!);

    await waitFor(() =>
      expect(screen.queryByTestId("two-factor-setup-dialog")).toBeNull()
    );
    expect(screen.getByText("settings.security.twoFactorEnabled")).toBeTruthy();
    expect(refetchSession).toHaveBeenCalledOnce();
    expect(disableTwoFactor).not.toHaveBeenCalled();
  });

  it("reports setup key copy failures", async () => {
    const user = userEvent.setup();
    enableTwoFactor.mockResolvedValue({
      data: {
        backupCodes: ["amber-forest"],
        totpURI: "otpauth://totp/Lunaris:test?secret=ABCDEF",
      },
      error: null,
    });

    render(<TwoFactorSection enabled={false} />);
    await user.click(screen.getByText("settings.security.setUpTwoFactor"));
    const dialog = await screen.findByTestId("two-factor-setup-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "password"
    );
    await user.click(within(dialog).getByText("common.continue"));
    await within(dialog).findByRole("img", {
      name: "settings.security.twoFactorQrLabel",
    });

    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("clipboard denied"));
    await user.click(
      within(dialog).getByText("settings.security.copySetupKey")
    );

    expect(toastError).toHaveBeenCalledWith("common.error");
    writeText.mockRestore();
  });

  it("completes verified setup when dismissed after acknowledgement", async () => {
    const user = userEvent.setup();
    enableTwoFactor.mockResolvedValue({
      data: {
        backupCodes: ["amber-forest", "quiet-river"],
        totpURI:
          "otpauth://totp/Lunaris:test@example.com?secret=ABCDEF&issuer=Lunaris",
      },
      error: null,
    });
    verifyTotp.mockResolvedValue({ data: { status: true }, error: null });

    render(<TwoFactorSection enabled={false} />);

    await user.click(screen.getByText("settings.security.setUpTwoFactor"));
    const dialog = await screen.findByTestId("two-factor-setup-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "correct horse battery staple"
    );
    await user.click(within(dialog).getByText("common.continue"));
    await user.type(
      within(dialog).getByLabelText("settings.security.authenticatorCode"),
      "123456"
    );
    await user.click(
      within(dialog).getByText("settings.security.verifyAndEnable")
    );

    expect(await within(dialog).findByText("amber-forest")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("two-factor-setup-dialog")).toBeTruthy();

    await user.click(
      within(dialog).getByText("settings.security.savedBackupCodes")
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByTestId("two-factor-setup-dialog")).toBeNull()
    );
    expect(screen.getByText("settings.security.twoFactorEnabled")).toBeTruthy();
    expect(refetchSession).toHaveBeenCalledOnce();
    expect(disableTwoFactor).not.toHaveBeenCalled();
  });

  it("keeps setup on password confirmation when enabling fails", async () => {
    const user = userEvent.setup();
    enableTwoFactor.mockResolvedValue({
      data: null,
      error: { message: "invalid password" },
    });

    render(<TwoFactorSection enabled={false} />);
    await user.click(screen.getByText("settings.security.setUpTwoFactor"));
    const dialog = await screen.findByTestId("two-factor-setup-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "wrong password"
    );
    await user.click(within(dialog).getByText("common.continue"));

    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(
      within(dialog).getByLabelText("settings.security.currentPassword")
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("img", {
        name: "settings.security.twoFactorQrLabel",
      })
    ).toBeNull();
  });

  it("cleans up an incomplete setup when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    enableTwoFactor.mockResolvedValue({
      data: {
        backupCodes: ["amber-forest"],
        totpURI: "otpauth://totp/Lunaris:test?secret=ABCDEF",
      },
      error: null,
    });
    disableTwoFactor.mockResolvedValue({ data: { status: true }, error: null });

    render(<TwoFactorSection enabled={false} />);
    await user.click(screen.getByText("settings.security.setUpTwoFactor"));
    const dialog = await screen.findByTestId("two-factor-setup-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "password"
    );
    await user.click(within(dialog).getByText("common.continue"));
    await within(dialog).findByRole("img", {
      name: "settings.security.twoFactorQrLabel",
    });
    expect(enableTwoFactor).toHaveBeenCalledWith(
      { password: "password" },
      { disableSignal: true }
    );
    expect(refetchSession).not.toHaveBeenCalled();
    await user.click(within(dialog).getByText("common.cancel"));

    await waitFor(() =>
      expect(disableTwoFactor).toHaveBeenCalledWith(
        { password: "password" },
        { disableSignal: true }
      )
    );
    expect(screen.queryByTestId("two-factor-setup-dialog")).toBeNull();
    expect(refetchSession).not.toHaveBeenCalled();
  });

  it("requires acknowledgement after regenerating backup codes", async () => {
    const user = userEvent.setup();
    generateBackupCodes.mockResolvedValue({
      data: { backupCodes: ["new-forest", "new-river"] },
      error: null,
    });

    render(<TwoFactorSection enabled />);
    await user.click(screen.getByText("settings.security.manageTwoFactor"));
    await user.click(
      screen.getByText("settings.security.regenerateBackupCodes")
    );
    const dialog = await screen.findByTestId("two-factor-regenerate-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "password"
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "settings.security.regenerateBackupCodes",
      })
    );

    expect(await within(dialog).findByText("new-forest")).toBeTruthy();
    const done = within(dialog).getByText("common.done").closest("button");
    expect(done?.disabled).toBe(true);
    await user.click(
      within(dialog).getByText("settings.security.savedBackupCodes")
    );
    await user.click(done!);

    await waitFor(() =>
      expect(screen.queryByTestId("two-factor-regenerate-dialog")).toBeNull()
    );
    expect(generateBackupCodes).toHaveBeenCalledWith({ password: "password" });
  });

  it("requires password confirmation before disabling 2FA", async () => {
    const user = userEvent.setup();
    disableTwoFactor.mockResolvedValue({ data: { status: true }, error: null });

    render(<TwoFactorSection enabled />);
    await user.click(screen.getByText("settings.security.manageTwoFactor"));
    expect(
      screen
        .getByTestId("settings-security-two-factor-disable")
        .getAttribute("data-variant")
    ).toBe("destructive");
    await user.click(screen.getByText("settings.security.disableTwoFactor"));
    const dialog = await screen.findByTestId("two-factor-disable-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.currentPassword"),
      "password"
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "settings.security.disableTwoFactor",
      })
    );

    await waitFor(() =>
      expect(disableTwoFactor).toHaveBeenCalledWith({ password: "password" })
    );
    expect(capture).toHaveBeenCalledWith("two_factor_disabled");
    expect(
      screen.getByText("settings.security.twoFactorDisabled")
    ).toBeTruthy();
  });
});
