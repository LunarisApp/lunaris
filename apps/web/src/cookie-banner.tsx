import { registerCookieBanner } from "@probo/cookie-banner";
import { createElement, Fragment, type ReactNode } from "react";
import {
  PROBO_BANNER_ID,
  PROBO_BASE_URL,
  proboCookieBannerEnabled,
} from "./cookie-banner-config";

export { proboCookieBannerEnabled } from "./cookie-banner-config";

if (proboCookieBannerEnabled) {
  registerCookieBanner();
}

export function ProboCookieBanner() {
  if (!proboCookieBannerEnabled) return null;

  return createElement(
    Fragment,
    null,
    createElement("probo-cookie-banner", {
      "banner-id": PROBO_BANNER_ID,
      "base-url": PROBO_BASE_URL,
      position: "bottom-left",
    }),
    // Probo validates link presence when the banner loads. Visible link lives
    // on the preferences route, so keep this sentinel out of the UI and tab order.
    createElement("probo-settings-link", {
      "aria-hidden": true,
      className: "!hidden",
      hidden: true,
      role: "presentation",
      tabIndex: -1,
    }),
  );
}

interface ProboCookieSettingsLinkProps {
  children?: ReactNode;
  className?: string;
}

export function ProboCookieSettingsLink({
  children,
  className,
}: ProboCookieSettingsLinkProps) {
  return createElement("probo-settings-link", { className }, children);
}
