import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { useRegion } from "../region";

const APP_ORIGIN = "https://lunaris.app";
const ADD_ACCOUNT_QUERY_PARAM = "addAccount";
const ACCOUNT_SWITCH_TARGET_STATE_KEY = "accountSwitchTargetUserId";
const LOGOUT_PENDING_STATE_KEY = "logoutPending";
const REGION_QUERY_PARAM = "region";
const REDIRECT_TO_QUERY_PARAM = "redirectTo";
const POST_AUTH_PATHS = new Set([
  "/auth/device",
  "/auth/accept-invitation",
  "/auth/agent-consent",
]);

function createAppUrl(path: string) {
  return new URL(path, APP_ORIGIN);
}

export function createAccountSwitchNavigationState(
  userId: string | null | undefined,
  enabled = true
) {
  return enabled && userId
    ? { [ACCOUNT_SWITCH_TARGET_STATE_KEY]: userId }
    : undefined;
}

export function getAccountSwitchTargetUserId(state: unknown) {
  if (!state || typeof state !== "object") {
    return null;
  }
  const value = (state as Record<string, unknown>)[
    ACCOUNT_SWITCH_TARGET_STATE_KEY
  ];
  return typeof value === "string" ? value : null;
}

export function createLogoutNavigationState() {
  return { [LOGOUT_PENDING_STATE_KEY]: true };
}

export function isLogoutNavigationState(state: unknown) {
  if (!state || typeof state !== "object") {
    return false;
  }
  return (state as Record<string, unknown>)[LOGOUT_PENDING_STATE_KEY] === true;
}

function normalizeRedirectTo(redirectTo: string | null | undefined) {
  const candidate = redirectTo?.trim();
  if (!candidate) {
    return null;
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return null;
  }
  return candidate;
}

function isAuthPath(pathname: string) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

function ensureRegion(path: string, regionId?: string) {
  const url = createAppUrl(path);
  if (regionId && !url.searchParams.has(REGION_QUERY_PARAM)) {
    url.searchParams.set(REGION_QUERY_PARAM, regionId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function getRedirectToValue(location: {
  hash: string;
  pathname: string;
  search: string;
}) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function appendRedirectToPath(
  path: string,
  redirectTo: string | null | undefined
) {
  const candidate = normalizeRedirectTo(redirectTo);
  if (!candidate) {
    return path;
  }

  const url = createAppUrl(path);
  url.searchParams.set(REDIRECT_TO_QUERY_PARAM, candidate);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildAddAccountPath(
  authPath: string,
  location?: {
    hash: string;
    pathname: string;
    search: string;
  }
) {
  const url = createAppUrl(
    location ? buildAuthRedirectPath(authPath, location) : authPath
  );
  url.searchParams.set(ADD_ACCOUNT_QUERY_PARAM, "true");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function appendRedirectToUrl(
  url: string,
  redirectTo: string | null | undefined
) {
  const candidate = normalizeRedirectTo(redirectTo);
  if (!candidate) {
    return url;
  }

  const nextUrl = new URL(url);
  nextUrl.searchParams.set(REDIRECT_TO_QUERY_PARAM, candidate);
  return nextUrl.toString();
}

export function buildAuthRedirectPath(
  authPath: string,
  location: {
    hash: string;
    pathname: string;
    search: string;
  }
) {
  return appendRedirectToPath(authPath, getRedirectToValue(location));
}

export function resolveRedirectTo({
  fallbackPath,
  redirectTo,
  regionId,
}: {
  fallbackPath: string;
  redirectTo: string | null | undefined;
  regionId?: string;
}) {
  const fallback = ensureRegion(fallbackPath, regionId);
  const candidate = normalizeRedirectTo(redirectTo);
  if (!candidate) {
    return fallback;
  }

  const url = createAppUrl(candidate);
  if (isAuthPath(url.pathname) && !POST_AUTH_PATHS.has(url.pathname)) {
    return fallback;
  }

  return ensureRegion(`${url.pathname}${url.search}${url.hash}`, regionId);
}

export function useAuthRedirect() {
  const { pathWithRegion, region, urlWithRegion } = useRegion();
  const [searchParams] = useSearchParams();
  const isAddingAccount = searchParams.get(ADD_ACCOUNT_QUERY_PARAM) === "true";
  const redirectTo = searchParams.get(REDIRECT_TO_QUERY_PARAM);
  const resolvedRedirectTo = resolveRedirectTo({
    fallbackPath: pathWithRegion("/"),
    redirectTo,
    regionId: region.id,
  });

  const pathWithRedirect = useCallback(
    (path: string) => {
      const url = createAppUrl(
        appendRedirectToPath(pathWithRegion(path), redirectTo)
      );
      if (isAddingAccount) {
        url.searchParams.set(ADD_ACCOUNT_QUERY_PARAM, "true");
      }
      return `${url.pathname}${url.search}${url.hash}`;
    },
    [isAddingAccount, pathWithRegion, redirectTo]
  );

  const urlWithRedirect = useCallback(
    (url: string) => appendRedirectToUrl(urlWithRegion(url), redirectTo),
    [redirectTo, urlWithRegion]
  );

  return {
    isAddingAccount,
    pathWithRedirect,
    redirectTo,
    resolvedRedirectTo,
    urlWithRedirect,
  };
}
