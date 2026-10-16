import "./globals.css";

import { PlatformProvider } from "@repo/platform";
import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { CriticalError } from "./components/error";
import AppProviders from "./providers";
import AppRouter from "./router";
import { type AppRuntime, AppRuntimeContext } from "./runtime";
import type { Shell } from "./types";

export type { AppUpdateState } from "@repo/features/app-update";
export type { AppRuntime } from "./runtime";
export type { Shell } from "./types";

const MOBILE_BREAKPOINT = 768;

function resolveShell(runtime: AppRuntime, shell?: Shell): Shell {
  if (shell) {
    return shell;
  }
  return runtime.platform.viewport.width() < MOBILE_BREAKPOINT
    ? "mobile"
    : "desktop";
}

export interface AppProps {
  runtime: AppRuntime;
  shell?: Shell;
}

export default function App({ runtime, shell }: AppProps) {
  const [resolved] = useState(() => resolveShell(runtime, shell));

  return (
    <PlatformProvider platform={runtime.platform}>
      <ErrorBoundary FallbackComponent={CriticalError}>
        <AppRuntimeContext.Provider value={runtime}>
          <AppProviders
            appUpdate={runtime.appUpdate}
            permissionCheck={runtime.permissionCheck}
          >
            <AppRouter runtime={runtime} shell={resolved} />
          </AppProviders>
        </AppRuntimeContext.Provider>
      </ErrorBoundary>
    </PlatformProvider>
  );
}
