import { initPostHogBrowser } from "@repo/utils/posthog-browser";
import { createPostHogBrowserDrain } from "@repo/utils/posthog-log";
import { auditRedactPreset, initLogger } from "evlog";
import posthog from "posthog-js";

const posthogConfigured = initPostHogBrowser(posthog, {
  apiHost: import.meta.env.VITE_POSTHOG_API_HOST,
  appSurface: "desktop",
  appVersion: __BUILD_VERSION__,
  environment: import.meta.env.MODE,
  key: import.meta.env.VITE_POSTHOG_KEY,
  persistence: "localStorage",
  uiHost: import.meta.env.VITE_POSTHOG_UI_HOST,
});

if (posthogConfigured) {
  posthog.set_config({
    logs: {
      captureConsoleLogs: false,
      environment: import.meta.env.MODE,
      serviceName: "desktop",
      serviceVersion: __BUILD_VERSION__,
    },
  });
}

initLogger({
  drain: posthogConfigured ? createPostHogBrowserDrain(posthog) : undefined,
  env: {
    environment: import.meta.env.MODE,
    service: "desktop",
    version: __BUILD_VERSION__,
  },
  pretty: import.meta.env.DEV,
  redact: auditRedactPreset,
  silent: posthogConfigured && !import.meta.env.DEV,
});
