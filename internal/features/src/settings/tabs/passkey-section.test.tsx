import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  addPasskey,
  capture,
  deletePasskey,
  listUserPasskeys,
  toastError,
  toastSuccess,
} = vi.hoisted(() => ({
  addPasskey: vi.fn(),
  capture: vi.fn(),
  deletePasskey: vi.fn(),
  listUserPasskeys: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { capture },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key}:${values.name}` : key,
  }),
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
    passkey: { addPasskey, deletePasskey, listUserPasskeys },
  }),
}));

import { PasskeySection } from "./passkey-section";

const savedPasskey = {
  backedUp: true,
  createdAt: "2026-07-15T08:00:00.000Z",
  deviceType: "multiDevice" as const,
  id: "passkey-1",
  name: "MacBook Touch ID",
};

function renderPasskeys() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PasskeySection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  onlineManager.setOnline(true);
  vi.stubGlobal("PublicKeyCredential", class PublicKeyCredential {});
  addPasskey.mockReset();
  capture.mockClear();
  deletePasskey.mockReset();
  listUserPasskeys.mockReset();
  toastError.mockClear();
  toastSuccess.mockClear();
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("PasskeySection", () => {
  it("renders a scoped offline state without a loading skeleton", async () => {
    onlineManager.setOnline(false);

    renderPasskeys();

    expect(
      await screen.findByText("settings.security.offlineToLoad"),
    ).toBeTruthy();
    expect(screen.queryByTestId("passkeys-loading")).toBeNull();
    expect(listUserPasskeys).not.toHaveBeenCalled();
  });

  it("renders a named synced passkey with its creation date", async () => {
    listUserPasskeys.mockResolvedValue({ data: [savedPasskey], error: null });
    const expectedDate = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
    }).format(new Date(savedPasskey.createdAt));

    renderPasskeys();

    expect(await screen.findByText("MacBook Touch ID")).toBeTruthy();
    expect(
      screen.getByText(
        `settings.security.syncedPasskey · ${expectedDate}`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "settings.security.removePasskey MacBook Touch ID",
      }),
    ).toBeTruthy();
  });

  it("registers a passkey with a trimmed required name", async () => {
    const user = userEvent.setup();
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    addPasskey.mockResolvedValue({ data: savedPasskey, error: null });
    renderPasskeys();

    await screen.findByText("settings.security.noPasskeys");
    await user.click(screen.getByText("settings.security.addPasskey"));
    const dialog = await screen.findByTestId("passkey-add-dialog");
    const submit = within(dialog).getByRole("button", {
      name: "settings.security.addPasskey",
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const nameInput = within(dialog).getByLabelText(
      "settings.security.passkeyName",
    );
    await user.type(nameInput, "x".repeat(65));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.clear(nameInput);
    await user.type(
      nameInput,
      "  MacBook Touch ID  ",
    );
    await user.click(submit);

    await waitFor(() => expect(addPasskey).toHaveBeenCalledWith({
      name: "MacBook Touch ID",
    }));
    expect(await screen.findByText("MacBook Touch ID")).toBeTruthy();
    expect(capture).toHaveBeenCalledWith("passkey_registration_started");
    expect(capture).toHaveBeenCalledWith("passkey_added");
    expect(toastSuccess).toHaveBeenCalledWith(
      "settings.security.passkeyAdded",
    );
  });

  it("treats a cancelled registration as a silent cancellation", async () => {
    const user = userEvent.setup();
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    addPasskey.mockResolvedValue({
      data: null,
      error: { code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" },
    });
    renderPasskeys();

    await screen.findByText("settings.security.noPasskeys");
    await user.click(screen.getByText("settings.security.addPasskey"));
    const dialog = await screen.findByTestId("passkey-add-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.passkeyName"),
      "Security key",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "settings.security.addPasskey",
      }),
    );

    await waitFor(() => expect(addPasskey).toHaveBeenCalledOnce());
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(capture).not.toHaveBeenCalledWith(
      "passkey_registration_failed",
      expect.anything(),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and reports registration errors", async () => {
    const user = userEvent.setup();
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    addPasskey.mockResolvedValue({
      data: null,
      error: { code: "ERROR_AUTHENTICATOR_GENERAL_ERROR" },
    });
    renderPasskeys();

    await screen.findByText("settings.security.noPasskeys");
    await user.click(screen.getByText("settings.security.addPasskey"));
    const dialog = await screen.findByTestId("passkey-add-dialog");
    await user.type(
      within(dialog).getByLabelText("settings.security.passkeyName"),
      "Security key",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "settings.security.addPasskey",
      }),
    );

    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("passkey-add-dialog")).toBeTruthy();
    expect(capture).toHaveBeenCalledWith("passkey_registration_failed", {
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
    });
  });

  it("removes a passkey only after confirmation", async () => {
    const user = userEvent.setup();
    listUserPasskeys.mockResolvedValue({ data: [savedPasskey], error: null });
    deletePasskey.mockResolvedValue({ data: { status: true }, error: null });
    renderPasskeys();

    await screen.findByText("MacBook Touch ID");
    await user.click(screen.getByText("settings.security.removePasskey"));
    expect(deletePasskey).not.toHaveBeenCalled();
    const dialog = await screen.findByTestId("passkey-remove-dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "settings.security.removePasskey",
      }),
    );

    await waitFor(() =>
      expect(deletePasskey).toHaveBeenCalledWith({ id: "passkey-1" }),
    );
    expect(screen.queryByText("MacBook Touch ID")).toBeNull();
    expect(capture).toHaveBeenCalledWith("passkey_removed");
  });

  it("shows loading, error/retry, empty, and unsupported states", async () => {
    vi.unstubAllGlobals();
    let rejectList: ((reason?: unknown) => void) | undefined;
    listUserPasskeys.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectList = reject;
        }),
    );
    renderPasskeys();

    expect(screen.getByTestId("passkeys-loading")).toBeTruthy();
    expect(screen.getByText("settings.security.passkeysUnsupported")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "settings.security.addPasskey",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    rejectList?.(new Error("network"));
    expect(await screen.findByText("settings.security.passkeysLoadFailed")).toBeTruthy();
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    await userEvent.click(screen.getByText("common.retry"));
    expect(await screen.findByText("settings.security.noPasskeys")).toBeTruthy();
  });
});
