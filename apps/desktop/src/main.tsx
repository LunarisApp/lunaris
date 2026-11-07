import { OrganizationEditionProvider } from "@app/edition";
import "./instrumentation";
import App from "@repo/app-shell";
import { applyStoredAppearance } from "@repo/features/appearance";
import { serializeErrorForLog } from "@repo/utils/log-error";
import { log } from "evlog";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keychainStorage } from "./auth-storage";
import { registerDesktopDeepLinks } from "./deep-link";
import { desktopRuntime } from "./runtime";
import { useDesktopAppUpdate } from "./app-update";

applyStoredAppearance();

function DesktopApp() {
  const appUpdate = useDesktopAppUpdate();
  return <App runtime={{ ...desktopRuntime, appUpdate }} shell="desktop" />;
}

function reportDeepLinkError(error: Error) {
  log.error({
    action: "desktop.deep_link.register",
    error: serializeErrorForLog(error),
    outcome: "failure",
  });
}

async function bootstrap() {
  try {
    await registerDesktopDeepLinks({
      onError: reportDeepLinkError,
      storage: keychainStorage,
    });
  } catch (error) {
    reportDeepLinkError(
      error instanceof Error ? error : new Error("Desktop deep-link failed")
    );
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <OrganizationEditionProvider>
        <DesktopApp />
      </OrganizationEditionProvider>
    </StrictMode>
  );
}

void bootstrap();
