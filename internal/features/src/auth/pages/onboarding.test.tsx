import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import OnboardingPage from "./onboarding";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "auth.onboarding.description": "Help us tailor your experience.",
          "auth.onboarding.otherPlaceholder": "Something else...",
          "auth.onboarding.purposeAcademic": "Academic",
          "auth.onboarding.purposeOther": "Other",
          "auth.onboarding.purposePersonal": "Personal",
          "auth.onboarding.purposeWork": "Work",
          "auth.onboarding.purposeWriting": "Writing",
          "auth.onboarding.title": "What brings you to Lunaris?",
          "common.continue": "Continue",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("../context", () => ({
  useAuth: () => ({
    useSession: () => ({
      data: { user: { id: "user-1" } },
      isPending: false,
    }),
  }),
}));

vi.mock("../redirect", () => ({
  useAuthRedirect: () => ({ resolvedRedirectTo: "/" }),
}));

describe("OnboardingPage", () => {
  it("exposes selection state and a labelled Other field", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "What brings you to Lunaris?",
      })
    ).toBeTruthy();

    const writing = screen.getByRole("button", { name: "Writing" });
    expect(writing.getAttribute("aria-pressed")).toBe("false");

    const personal = screen.getByRole("button", { name: "Personal" });
    await user.tab();
    expect(document.activeElement).toBe(personal);
    await user.keyboard(" ");
    expect(personal.getAttribute("aria-pressed")).toBe("true");

    await user.click(writing);
    expect(writing.getAttribute("aria-pressed")).toBe("true");

    const other = screen.getByRole("textbox", { name: "Other" });
    expect(other.closest('[role="button"]')).toBeNull();
    await user.type(other, "Screen writing");
    expect((other as HTMLInputElement).value).toBe("Screen writing");

    expect((await axe(container)).violations).toEqual([]);
  });
});
