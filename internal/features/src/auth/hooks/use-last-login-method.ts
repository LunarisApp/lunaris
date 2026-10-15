import { LAST_LOGIN_METHOD_COOKIE_NAME } from "@repo/auth/client";
import { usePlatform } from "@repo/platform";
import { useEffect, useState } from "react";
import { useAuth } from "../context";

export type VisibleLoginMethod = "email" | "google";

interface LastLoginMethodClient {
  getCookie?: () => Promise<string>;
  getLastUsedLoginMethod?: () => string | null;
}

function asVisibleLoginMethod(value: string | null | undefined) {
  return value === "email" || value === "google" ? value : null;
}

export function readLastLoginMethodCookie(cookieHeader: string) {
  const prefix = `${LAST_LOGIN_METHOD_COOKIE_NAME}=`;
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (!value) return null;
  try {
    return asVisibleLoginMethod(decodeURIComponent(value));
  } catch {
    return null;
  }
}

function readBrowserMethod(client: LastLoginMethodClient) {
  try {
    return asVisibleLoginMethod(client.getLastUsedLoginMethod?.());
  } catch {
    return null;
  }
}

export function useLastLoginMethod(): VisibleLoginMethod | null {
  const auth = useAuth() as LastLoginMethodClient;
  const { kind: platformKind } = usePlatform();
  const browserMethod = readBrowserMethod(auth);
  const [desktopMethod, setDesktopMethod] = useState<{
    auth: LastLoginMethodClient;
    method: VisibleLoginMethod | null;
  } | null>(null);

  useEffect(() => {
    const getCookie = auth.getCookie;
    if (browserMethod || platformKind !== "desktop" || !getCookie) return;

    let active = true;
    setDesktopMethod(null);

    getCookie()
      .then((cookieHeader) => {
        if (!active) return;
        setDesktopMethod({
          auth,
          method: readLastLoginMethodCookie(cookieHeader),
        });
      })
      .catch(() => {
        if (active) setDesktopMethod({ auth, method: null });
      });

    return () => {
      active = false;
    };
  }, [auth, browserMethod, platformKind]);

  if (browserMethod) return browserMethod;
  return platformKind === "desktop" && desktopMethod?.auth === auth
    ? desktopMethod.method
    : null;
}
