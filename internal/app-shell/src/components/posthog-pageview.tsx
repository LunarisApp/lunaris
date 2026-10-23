import { useRegionClients } from "@repo/features/region";
import { usePlatform } from "@repo/platform";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

const AUTH_ROUTES = new Set([
  "accept-invitation",
  "agent-consent",
  "device",
  "continue",
  "email",
  "forgot-password",
  "onboarding",
  "register",
  "reset-password",
  "two-factor",
  "verify-email",
]);
const SETTINGS_ROUTES = new Set([
  "account",
  "keybindings",
  "local-data",
  "preferences",
  "security",
]);

export function analyticsRoutePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const [first, second, third, fourth, fifth] = segments;

  if (!first) {
    return "/";
  }
  if (first === "auth") {
    return second && AUTH_ROUTES.has(second) ? `/auth/${second}` : "/auth";
  }
  if (first === "settings") {
    return second && SETTINGS_ROUTES.has(second)
      ? `/settings/${second}`
      : "/settings";
  }

  if (!second) {
    return "/:organization";
  }
  if (second === "settings") {
    return "/:organization/settings";
  }
  if (!third) {
    return "/:organization/:workspace";
  }
  if (!fourth) {
    return "/:organization/:workspace/:view";
  }
  if (!fifth) {
    return "/:organization/:workspace/:view/:subview";
  }
  return "/:organization/:workspace/:view/:subview/:item";
}

export function PostHogPageviewTracker() {
  const { navigation } = usePlatform();
  const location = useLocation();
  const { manifest } = useRegionClients();
  const lastPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!manifest) {
      return;
    }
    posthog.set_config({
      addTracingHeaders: [new URL(manifest.apiUrl).hostname],
    });
  }, [manifest]);

  useEffect(() => {
    const route = analyticsRoutePath(location.pathname);
    if (lastPathname.current === location.pathname) {
      return;
    }
    lastPathname.current = location.pathname;
    posthog.capture("$pageview", {
      $current_url: new URL(route, navigation.origin()).toString(),
      $pathname: route,
    });
  }, [location.pathname, navigation]);

  return null;
}
