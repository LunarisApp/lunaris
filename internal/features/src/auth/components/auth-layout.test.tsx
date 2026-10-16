import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { AuthLayout } from "./auth-layout";

vi.mock("./region-indicator", () => ({
  RegionIndicator: () => null,
}));

vi.mock("./region-switcher", () => ({
  RegionSwitcher: () => null,
}));

describe("AuthLayout", () => {
  it("provides a page heading and hides its decorative image", async () => {
    const { container } = render(
      <AuthLayout description="Choose a sign-in method" title="Sign in">
        <button type="button">Continue</button>
      </AuthLayout>
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" })
    ).toBeTruthy();

    const image = container.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.closest("aside")?.getAttribute("aria-hidden")).toBe("true");
    expect((await axe(container)).violations).toEqual([]);
  });
});
