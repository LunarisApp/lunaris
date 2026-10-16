"use client";

import type { ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";
import type { CookieSettingsLinkProps, Shell } from "./types";

export function createSettingsChildRoutes(
  shell: Shell,
  CookieSettingsLink?: ComponentType<CookieSettingsLinkProps>
): RouteObject[] {
  const accountRoute: RouteObject = {
    path: "account",
    lazy: async () => {
      const { AccountContent } = await import("./tabs/account");
      if (shell === "desktop") {
        return { Component: AccountContent };
      }
      const { MobileTabPage } = await import("./mobile-tab-page");
      return {
        Component: () => (
          <MobileTabPage tab="account">
            <AccountContent />
          </MobileTabPage>
        ),
      };
    },
  };
  const preferencesRoute: RouteObject = {
    path: "preferences",
    lazy: async () => {
      const { PreferencesContent } = await import("./tabs/preferences");
      const Content = () => (
        <PreferencesContent CookieSettingsLink={CookieSettingsLink} />
      );
      if (shell === "desktop") {
        return { Component: Content };
      }
      const { MobileTabPage } = await import("./mobile-tab-page");
      return {
        Component: () => (
          <MobileTabPage tab="preferences">
            <Content />
          </MobileTabPage>
        ),
      };
    },
  };
  const localDataRoute: RouteObject = {
    path: "local-data",
    lazy: async () => {
      const { LocalDataContent } = await import("./tabs/local-data");
      if (shell === "desktop") {
        return { Component: LocalDataContent };
      }
      const { MobileTabPage } = await import("./mobile-tab-page");
      return {
        Component: () => (
          <MobileTabPage tab="local-data">
            <LocalDataContent />
          </MobileTabPage>
        ),
      };
    },
  };

  if (shell === "mobile") {
    return [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./mobile-index-page"))
            .MobileSettingsIndexPage,
        }),
      },
      accountRoute,
      preferencesRoute,
      localDataRoute,
    ];
  }

  return [
    { index: true, element: <Navigate replace to="account" /> },
    accountRoute,
    preferencesRoute,
    {
      path: "keybindings",
      lazy: async () => ({
        Component: (await import("./tabs/keybindings")).KeybindingsContent,
      }),
    },
    localDataRoute,
  ];
}
