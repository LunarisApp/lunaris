import { type ComponentType, isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { createSettingsChildRoutes } from "./routes";
import type { CookieSettingsLinkProps } from "./types";

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
