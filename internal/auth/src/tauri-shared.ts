const AUTH_STORAGE_PREFIX = "lunaris-auth-";
const MAX_KEY_LENGTH = 128;
const SESSION_STORAGE_SUFFIX = "_session_data";

export function isValidLunarisRegionId(regionId: string) {
  return (
    /^[A-Za-z0-9._-]+$/.test(regionId) &&
    `${AUTH_STORAGE_PREFIX}${regionId}${SESSION_STORAGE_SUFFIX}`.length <=
      MAX_KEY_LENGTH
  );
}

function internalAuthPath(url: URL) {
  return `/${[url.hostname, url.pathname.replace(/^\/+/, "")]
    .filter(Boolean)
    .join("/")
    .replace(/^\/+/, "")}`;
}

export function parseLunarisAuthCallbackUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    !url.href.startsWith("lunaris://") ||
    url.protocol !== "lunaris:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hash !== ""
  ) {
    return null;
  }

  const path = internalAuthPath(url);
  if (path !== "/" && path !== "/auth" && !path.startsWith("/auth/")) {
    return null;
  }

  return { path, url };
}

export function isValidLunarisOAuthCallbackUrl(value: string) {
  const callback = parseLunarisAuthCallbackUrl(value);
  return callback?.path === "/" || callback?.path === "/auth";
}
