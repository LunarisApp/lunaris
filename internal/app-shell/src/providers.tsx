import { Toaster } from "@lunarisapp/ui/components/sonner";
import { TooltipProvider } from "@lunarisapp/ui/components/tooltip";
import { createQueryClient } from "@repo/data/http";
import { DebugLoggingProvider } from "@repo/features/debug-logging";
import {
  AppUpdateProvider,
  type AppUpdateState,
} from "@repo/features/app-update";
import { FontFamilyProvider } from "@repo/features/font-family";
import { FontSizeProvider } from "@repo/features/font-size";
import { HotkeysProvider } from "@repo/features/hotkeys";
import { LocaleProvider } from "@repo/features/locale";
import {
  type PermissionCheck,
  PermissionProvider,
} from "@repo/features/permissions";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

const queryClient = createQueryClient();

export default function AppProviders({
  appUpdate,
  children,
  permissionCheck,
}: {
  appUpdate?: AppUpdateState;
  children: ReactNode;
  permissionCheck?: PermissionCheck;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <LocaleProvider>
          <PermissionProvider check={permissionCheck}>
            <DebugLoggingProvider>
              <FontFamilyProvider>
                <FontSizeProvider>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                  >
                    <TooltipProvider>
                      <AppUpdateProvider value={appUpdate}>
                        {children}
                        <Toaster />
                      </AppUpdateProvider>
                    </TooltipProvider>
                  </ThemeProvider>
                </FontSizeProvider>
              </FontFamilyProvider>
            </DebugLoggingProvider>
          </PermissionProvider>
        </LocaleProvider>
      </HotkeysProvider>
      {import.meta.env.DEV && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
