import { type ComponentType, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createSettingsChildRoutes } from "./routes";
import type { CookieSettingsLinkProps } from "./types";

// Route wiring does not need the preferences UI and its dependency tree.
vi.mock("./tabs/preferences", () => ({
  PreferencesContent: () => null,
}));

describe("createSettingsChildRoutes", () => {
  it.each(["desktop", "mobile"] as const)(
    "omits billing from %s account settings",
    (shell) => {
      expect(
        createSettingsChildRoutes(shell).some(
          (route) => route.path === "billing"
        )
      ).toBe(false);
    }
  );

  it.each(["desktop", "mobile"] as const)(
    "exposes a dedicated agents route in the %s shell",
    (shell) => {
      const route = createSettingsChildRoutes(shell).find(
        (candidate) => candidate.path === "agents"
      );
      expect(route?.lazy).toBeTypeOf("function");
    }
  );

  it("loads settings tabs lazily", () => {
    for (const shell of ["desktop", "mobile"] as const) {
      const routes = createSettingsChildRoutes(shell);
      for (const route of routes.filter((candidate) => candidate.path)) {
        expect(route.lazy).toBeTypeOf("function");
      }
    }
  });

  it.each(["desktop", "mobile"] as const)(
    "omits the retired %s security route",
    (shell) => {
      expect(
        createSettingsChildRoutes(shell).some(
          (route) => route.path === "security"
        )
      ).toBe(false);
    }
  );

  it("passes web cookie settings into preferences", async () => {
    const CookieSettingsLink: ComponentType<CookieSettingsLinkProps> = () =>
      null;
    const route = createSettingsChildRoutes("desktop", CookieSettingsLink).find(
      (candidate) => candidate.path === "preferences"
    );

    const loadRoute = route?.lazy as
      | (() => Promise<{ Component?: ComponentType }>)
      | undefined;
    const loadedRoute = await loadRoute?.();
    const Component = loadedRoute?.Component as
      | (() => ReactElement<{ CookieSettingsLink?: ComponentType }>)
      | undefined;
    const element = Component?.();

    expect(isValidElement(element)).toBe(true);
    if (!isValidElement<{ CookieSettingsLink?: ComponentType }>(element)) {
      throw new Error("Preferences route element missing");
    }
    expect(element.props.CookieSettingsLink).toBe(CookieSettingsLink);
  });
});
