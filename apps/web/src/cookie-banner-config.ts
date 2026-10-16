const WEB_PRODUCTION_ORIGIN = "https://web.lunaris.app";

export const PROBO_BANNER_ID = import.meta.env.VITE_PROBO_COOKIE_BANNER_ID;
export const PROBO_BASE_URL = import.meta.env.VITE_PROBO_COOKIE_BANNER_BASE_URL;

export const proboCookieBannerEnabled = Boolean(
  window.location.origin === WEB_PRODUCTION_ORIGIN &&
    PROBO_BANNER_ID &&
    PROBO_BASE_URL
);
