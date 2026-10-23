import { getPublicRuntimeConfig } from "@repo/app-shell/runtime-config";
import { getConsent } from "@probo/cookie-banner/consent";
import { initPostHogBrowser } from "@repo/utils/posthog-browser";
import { createPostHogBrowserDrain } from "@repo/utils/posthog-log";
import { auditRedactPreset, initLogger } from "evlog";
import posthog from "posthog-js";

const runtime = getPublicRuntimeConfig();
const hasPostHogConfig = Boolean(
  (runtime?.POSTHOG_API_HOST ?? import.meta.env.VITE_POSTHOG_API_HOST) &&
    (runtime?.POSTHOG_KEY ?? import.meta.env.VITE_POSTHOG_KEY) &&
    (runtime?.POSTHOG_UI_HOST ?? import.meta.env.VITE_POSTHOG_UI_HOST)
);
const posthogDrain = createPostHogBrowserDrain(posthog);
let posthogInitialized = false;

const consent = getConsent();

function initializePostHogWithConsent(
  categories: Readonly<Record<string, boolean>>
) {
  if (posthogInitialized) {
    return;
  }
  const analyticsAllowed = categories.analytics === true;

  posthogInitialized = initPostHogBrowser(posthog, {
    apiHost: runtime?.POSTHOG_API_HOST ?? import.meta.env.VITE_POSTHOG_API_HOST,
    appSurface: "web",
    appVersion: __BUILD_VERSION__,
    cookielessMode: "on_reject",
    environment: import.meta.env.MODE,
    key: runtime?.POSTHOG_KEY ?? import.meta.env.VITE_POSTHOG_KEY,
    optOutCapturingByDefault: !analyticsAllowed,
    optOutPersistenceByDefault: !analyticsAllowed,
    persistence: "localStorage+cookie",
    uiHost: runtime?.POSTHOG_UI_HOST ?? import.meta.env.VITE_POSTHOG_UI_HOST,
  });

  if (!posthogInitialized) {
    return;
  }

  posthog.set_config({
    logs: {
      captureConsoleLogs: false,
      environment: import.meta.env.MODE,
      serviceName: "web",
      serviceVersion: __BUILD_VERSION__,
    },
  });

  consent.onChange((categories) => {
    if (categories.analytics === true) {
      posthog.opt_in_capturing({ captureEventName: false });
      return;
    }

    posthog.opt_out_capturing();
  });
}

consent.onReady(initializePostHogWithConsent);

initLogger({
  drain: hasPostHogConfig
    ? (context) => {
        if (posthogInitialized) {
          posthogDrain(context);
        }
      }
    : undefined,
  env: {
    environment: import.meta.env.MODE,
    service: "web",
    version: __BUILD_VERSION__,
  },
  pretty: import.meta.env.DEV,
  redact: auditRedactPreset,
  silent: hasPostHogConfig && !import.meta.env.DEV,
});
