import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import en from "../../locale/locales/en.json";
import ForgotPasswordPage from "./forgot-password";

const state = vi.hoisted(() => ({ capability: undefined as boolean | undefined }));
vi.mock("../../region", () => ({ useRegion: () => ({
  manifest: { capabilities: { passwordResetEmail: state.capability } },
  selectionRequired: false,
  authUrl: (path: string) => path,
  pathWithRegion: (path: string) => path,
  urlWithRegion: (path: string) => path,
}) }));
vi.mock("../context", () => ({ useAuth: () => ({ requestPasswordReset: vi.fn() }) }));
vi.mock("../components/auth-layout", () => ({ AuthLayout: ({ children, description }: { children: React.ReactNode; description: string }) => <main>{description}{children}</main> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key === "auth.emailRecoveryUnavailable" ? en.auth.emailRecoveryUnavailable : key }) }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

describe("email recovery capability", () => {
  it("blocks direct navigation to the recovery form without email", () => {
    state.capability = false;
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.queryByTestId("auth-forgot-email")).toBeNull();
    expect(screen.getByText(en.auth.emailRecoveryUnavailable)).toBeTruthy();
  });
  it.each([true, undefined])("allows configured and legacy servers (%s)", (capability) => {
    state.capability = capability;
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByTestId("auth-forgot-email")).toBeTruthy();
  });
});
