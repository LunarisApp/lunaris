import { OrganizationEditionProvider } from "@app/edition";
import { applyStoredAppearance } from "@repo/features/appearance";
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./instrumentation";

applyStoredAppearance();

import App, { type AppRuntime, type AppUpdateState } from "@repo/app-shell";
import { createBrowserPlatform } from "@repo/platform";
import { proboCookieBannerEnabled } from "./cookie-banner-config";
import { webPanelWindows } from "./panel-windows";
import { scheduleServiceWorkerRegistration } from "./service-worker-registration";

const webPlatform = createBrowserPlatform({
  kind: "web",
  panelWindows: webPanelWindows,
});

const ProboCookieBanner = lazy(() =>
  import("./cookie-banner").then((module) => ({
    default: module.ProboCookieBanner,
  }))
);
const ProboCookieSettingsLink = lazy(() =>
  import("./cookie-banner").then((module) => ({
    default: module.ProboCookieSettingsLink,
  }))
);
const WebAppUpdateRegistration = lazy(
  () => import("./app-update-registration")
);

const createWebPowerSyncSession: AppRuntime["createPowerSyncSession"] = async (
  input
) => {
  const powerSync = await import("@repo/data/powersync-web");
  return powerSync.createWebPowerSyncSession(input);
};

function WebApp() {
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>();
  const [registerServiceWorker, setRegisterServiceWorker] = useState(false);

  useEffect(
    () =>
      scheduleServiceWorkerRegistration(() => setRegisterServiceWorker(true)),
    []
  );

  return (
    <>
      {registerServiceWorker ? (
        <Suspense fallback={null}>
          <WebAppUpdateRegistration onChange={setAppUpdate} />
        </Suspense>
      ) : null}
      <App
        runtime={{
          appUpdate,
          cookieSettingsLink: proboCookieBannerEnabled
            ? ProboCookieSettingsLink
            : undefined,
          createPowerSyncSession: createWebPowerSyncSession,
          platform: webPlatform,
        }}
      />
      {proboCookieBannerEnabled ? (
        <Suspense fallback={null}>
          <ProboCookieBanner />
        </Suspense>
      ) : null}
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <OrganizationEditionProvider>
      <WebApp />
    </OrganizationEditionProvider>
  </StrictMode>
);
