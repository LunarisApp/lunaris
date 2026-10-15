import type { ReactNode } from "react";

export interface CookieSettingsLinkProps {
  children?: ReactNode;
  className?: string;
}

export type TabId =
  | "account"
  | "keybindings"
  | "local-data"
  | "preferences";

export type Shell = "desktop" | "mobile";
