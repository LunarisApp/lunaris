import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context";
import { useConditionalPasskeyAutofill } from "./use-conditional-passkey-autofill";

const { capture, toastError } = vi.hoisted(() => ({
  capture: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: { capture } }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  capture.mockClear();
  toastError.mockClear();
});

function HookHarness({
  disabled = false,
  redirectTo = "/done",
}: {
  disabled?: boolean;
  redirectTo?: string;
}) {
  useConditionalPasskeyAutofill({ disabled, redirectTo });
  const location = useLocation();
  return <div>{location.pathname}</div>;
}

function renderHookHarness({
  disabled = false,
  passkeySignIn = vi.fn().mockResolvedValue({ error: null }),
  passkeysSupported = true,
  strictMode = false,
} = {}) {
  const supportsPasskeys = vi.fn(() => passkeysSupported);
  const harness = (
    <MemoryRouter initialEntries={["/auth"]}>
      <AuthProvider
        client={
          {
            signIn: { passkey: passkeySignIn },
            supportsPasskeys,
          } as never
        }
      >
        <HookHarness disabled={disabled} />
      </AuthProvider>
    </MemoryRouter>
  );
  const rendered = render(
    strictMode ? <StrictMode>{harness}</StrictMode> : harness
  );

  return { ...rendered, passkeySignIn, supportsPasskeys };
}

function enableConditionalPasskeys(available = true) {
  class MockPublicKeyCredential {
    static isConditionalMediationAvailable = vi
      .fn()
      .mockResolvedValue(available);
  }
  vi.stubGlobal("PublicKeyCredential", MockPublicKeyCredential);
  return MockPublicKeyCredential.isConditionalMediationAvailable;
}

describe("useConditionalPasskeyAutofill", () => {
  it("skips unsupported passkey clients", async () => {
    const capabilityCheck = enableConditionalPasskeys();
    const { passkeySignIn, supportsPasskeys } = renderHookHarness({
      passkeysSupported: false,
    });

    await waitFor(() => expect(supportsPasskeys).toHaveBeenCalledOnce());
    expect(capabilityCheck).not.toHaveBeenCalled();
    expect(passkeySignIn).not.toHaveBeenCalled();
  });

  it("skips unavailable conditional mediation", async () => {
    const capabilityCheck = enableConditionalPasskeys(false);
    const { passkeySignIn } = renderHookHarness();

    await waitFor(() => expect(capabilityCheck).toHaveBeenCalledOnce());
    expect(passkeySignIn).not.toHaveBeenCalled();
  });

  it("silently skips failed capability checks", async () => {
    class MockPublicKeyCredential {
      static isConditionalMediationAvailable = vi
        .fn()
        .mockRejectedValue(new Error("Not supported"));
    }
    vi.stubGlobal("PublicKeyCredential", MockPublicKeyCredential);
    const { passkeySignIn } = renderHookHarness();

    await waitFor(() =>
      expect(
        MockPublicKeyCredential.isConditionalMediationAvailable
      ).toHaveBeenCalledOnce()
    );
    expect(passkeySignIn).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("treats passkey cancellation silently", async () => {
    enableConditionalPasskeys();
    const passkeySignIn = vi.fn().mockResolvedValue({
      error: { code: "ERROR_CEREMONY_ABORTED" },
    });
    renderHookHarness({ passkeySignIn });

    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledOnce());
    expect(toastError).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalledWith(
      "auth_sign_in_failed",
      expect.anything()
    );
  });

  it("reports passkey response errors", async () => {
    enableConditionalPasskeys();
    const passkeySignIn = vi.fn().mockResolvedValue({
      error: { code: "FAILED", message: "Failed" },
    });
    renderHookHarness({ passkeySignIn });

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(capture).toHaveBeenCalledWith("auth_sign_in_failed", {
      method: "passkey",
    });
  });

  it("reports thrown passkey errors", async () => {
    enableConditionalPasskeys();
    const passkeySignIn = vi.fn().mockRejectedValue(new Error("Failed"));
    renderHookHarness({ passkeySignIn });

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(capture).toHaveBeenCalledWith("auth_sign_in_failed", {
      method: "passkey",
    });
  });

  it("redirects after successful autofill", async () => {
    enableConditionalPasskeys();
    const { passkeySignIn } = renderHookHarness();

    await waitFor(() =>
      expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true })
    );
    expect(await screen.findByText("/done")).toBeTruthy();
    expect(capture).toHaveBeenCalledWith("auth_sign_in", {
      method: "passkey",
    });
  });

  it("starts autofill once in React StrictMode", async () => {
    const capabilityCheck = enableConditionalPasskeys();
    const { passkeySignIn } = renderHookHarness({ strictMode: true });

    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledOnce());
    expect(capabilityCheck).toHaveBeenCalledTimes(2);
  });

  it("does not start autofill after unmount", async () => {
    let resolveAvailability: ((available: boolean) => void) | undefined;
    class MockPublicKeyCredential {
      static isConditionalMediationAvailable = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveAvailability = resolve;
          })
      );
    }
    vi.stubGlobal("PublicKeyCredential", MockPublicKeyCredential);
    const { passkeySignIn, unmount } = renderHookHarness();

    await waitFor(() =>
      expect(
        MockPublicKeyCredential.isConditionalMediationAvailable
      ).toHaveBeenCalledOnce()
    );
    unmount();
    await act(async () => resolveAvailability?.(true));

    expect(passkeySignIn).not.toHaveBeenCalled();
  });
});
