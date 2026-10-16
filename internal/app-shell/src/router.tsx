import {
  getAccountSwitchTargetUserId,
  useAuthRedirect,
} from "@repo/features/auth/redirect";
import { AuthProvider } from "@repo/features/auth/context";
import { RegionProvider, RegionReady } from "@repo/features/region";
import { LoaderView } from "@repo/features/loading";
import { HelpCenterPopover } from "@repo/features/help-center";
import { UserMenu } from "@repo/features/user-menu";
import { useRegionClients } from "@repo/features/region";
import { createSettingsChildRoutes } from "@repo/features/settings/routes";
import { useMemo } from "react";
import { markDefaultWorkspaceSeedPending } from "@repo/workspaces/bootstrap";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router";
import AuthGuard from "./components/auth-guard";
import { AppBarNavigation, AppLogo } from "./components/app-bar-navigation";
import { BuildVersion } from "@repo/features/build-version";
import { RouteCriticalError } from "./components/error";
import { PostHogPageviewTracker } from "./components/posthog-pageview";
import SuspenseLayout from "./components/suspense-layout";
import { OrganizationScopeGate } from "./components/organization-scope-gate";
import env from "./config";
import { useLogout } from "@repo/features/auth/use-logout";
import { type AppRuntime, useAppRuntime } from "./runtime";
import type { Shell } from "./types";
import { createEnabledAppToolRoutes } from "./app-tools";

interface AppRouterProps {
  runtime?: AppRuntime;
  shell: Shell;
}

function AppBuildVersion() {
  return <BuildVersion version={__BUILD_VERSION__} />;
}

function IndexRedirect({ initialLocationKey }: { initialLocationKey: string }) {
  const { authClient } = useRegionClients();
  const location = useLocation();
  const { data: session, isPending: sessionPending } =
    authClient?.useSession() ?? {
      data: null,
      isPending: true,
    };
  const { data: activeOrg, isPending: activeOrgPending } =
    authClient?.useActiveOrganization() ?? {
      data: null,
      isPending: true,
    };
  const accountSwitchTargetUserId = getAccountSwitchTargetUserId(
    location.state
  );
  const accountMatches =
    !accountSwitchTargetUserId ||
    session?.user.id === accountSwitchTargetUserId;
  const organizationMatches =
    !!activeOrg && activeOrg.id === session?.session.activeOrganizationId;
  // Honor `?redirectTo=` when present (e.g. post-verify-email callbacks drop
  // the hash but preserve the query). `resolvedRedirectTo` normalizes the
  // path (region param, auth-path sanitization) and falls back to `/`, so
  // without a redirectTo we still route through the organization home.
  const { redirectTo, resolvedRedirectTo } = useAuthRedirect();
  if (
    sessionPending ||
    activeOrgPending ||
    !accountMatches ||
    !organizationMatches
  ) {
    return <LoaderView />;
  }
  const target = redirectTo ? resolvedRedirectTo : `/${activeOrg.slug}`;
  return (
    <Navigate
      replace
      state={
        !redirectTo && location.key === initialLocationKey
          ? { resumeLastWorkspace: true }
          : undefined
      }
      to={target}
    />
  );
}

function RootLayoutContent() {
  const { authClient } = useRegionClients();
  const { agentSessionBridge: AgentSessionBridge } = useAppRuntime();

  if (!authClient) {
    return <RootLoaderFallback />;
  }

  return (
    <AuthProvider client={authClient}>
      {AgentSessionBridge ? <AgentSessionBridge /> : null}
      <PostHogPageviewTracker />
      <Outlet />
    </AuthProvider>
  );
}

type RoutingRuntime = Pick<
  AppRuntime,
  "authCallbackBaseUrl" | "cookieSettingsLink" | "createRegionClients"
>;

function RootLayout({ runtime }: { runtime?: RoutingRuntime }) {
  return (
    <RegionProvider
      authCallbackBaseUrl={runtime?.authCallbackBaseUrl}
      createClients={runtime?.createRegionClients}
      directory={env.REGION_DIRECTORY_JSON}
      directoryUrl={env.REGION_DIRECTORY_URL}
    >
      <RegionReady>
        <RootLayoutContent />
      </RegionReady>
    </RegionProvider>
  );
}

function RootLoaderFallback() {
  return (
    <div className="h-dvh">
      <LoaderView />
    </div>
  );
}

function WorkspacesAppBarLeading() {
  return (
    <>
      <AppLogo />
      <AppBarNavigation activeToolId="workspaces" />
    </>
  );
}

function WorkspacesAppBarTrailing() {
  const handleLogout = useLogout();

  return (
    <>
      <HelpCenterPopover
        className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground aria-expanded:hover:bg-sidebar-accent dark:aria-expanded:hover:bg-sidebar-accent"
        variant="ghost"
      />
      <UserMenu onLogout={handleLogout} />
    </>
  );
}

const AUTH_PAGE_LOADERS = {
  "accept-invitation": () =>
    import("@repo/features/auth/pages/accept-invitation"),
  "agent-consent": () => import("@repo/features/auth/pages/agent-consent"),
  continue: () => import("@repo/features/auth/pages/continue"),
  "email-sign-in": () => import("@repo/features/auth/pages/email-sign-in"),
  "forgot-password": () => import("@repo/features/auth/pages/forgot-password"),
  register: () => import("@repo/features/auth/pages/register"),
  "reset-password": () => import("@repo/features/auth/pages/reset-password"),
  "sign-in": () => import("@repo/features/auth/pages/sign-in"),
  "two-factor": () => import("@repo/features/auth/pages/two-factor"),
  "verify-email": () => import("@repo/features/auth/pages/verify-email"),
} as const;

const lazyAuthPage = (page: keyof typeof AUTH_PAGE_LOADERS) => async () => ({
  Component: (await AUTH_PAGE_LOADERS[page]()).default,
});

const createAppRouter = (shell: Shell, runtime?: RoutingRuntime) => {
  const initialLocationKey = window.history.state?.key ?? "default";
  const toolRoutes = createEnabledAppToolRoutes({
    AppBarLeading: WorkspacesAppBarLeading,
    AppBarTrailing: WorkspacesAppBarTrailing,
    buildVersion: __BUILD_VERSION__,
    shell,
  });

  return createBrowserRouter([
    {
      path: "/",
      element: <RootLayout runtime={runtime} />,
      HydrateFallback: RootLoaderFallback,
      ErrorBoundary: RouteCriticalError,
      children: [
        {
          path: "auth",
          lazy: async () => {
            const { default: SignInPage } =
              await AUTH_PAGE_LOADERS["sign-in"]();
            return {
              Component: () => (
                <SignInPage
                  onAnonymousSessionCreated={() =>
                    markDefaultWorkspaceSeedPending({ kind: "anonymous" })
                  }
                />
              ),
            };
          },
        },
        {
          path: "auth/email",
          lazy: lazyAuthPage("email-sign-in"),
        },
        {
          path: "auth/continue",
          lazy: lazyAuthPage("continue"),
        },
        {
          path: "auth/register",
          lazy: async () => {
            const { default: RegisterPage } =
              await AUTH_PAGE_LOADERS.register();
            return {
              Component: () => (
                <RegisterPage
                  onRegistrationCompleted={(email) =>
                    markDefaultWorkspaceSeedPending({
                      email,
                      kind: "registered",
                    })
                  }
                />
              ),
            };
          },
        },
        {
          path: "auth/forgot-password",
          lazy: lazyAuthPage("forgot-password"),
        },
        {
          path: "auth/reset-password",
          lazy: lazyAuthPage("reset-password"),
        },
        {
          path: "auth/two-factor",
          lazy: lazyAuthPage("two-factor"),
        },
        {
          path: "auth/verify-email",
          lazy: lazyAuthPage("verify-email"),
        },
        {
          path: "auth/onboarding",
          lazy: async () => {
            const { default: OnboardingPage } = await import(
              "@repo/features/auth/pages/onboarding"
            );
            return {
              Component: () => (
                <OnboardingPage buildVersion={<AppBuildVersion />} />
              ),
            };
          },
        },
        {
          path: "auth/accept-invitation",
          lazy: lazyAuthPage("accept-invitation"),
        },
        {
          Component: AuthGuard,
          children: [
            {
              path: "auth/agent-consent",
              lazy: lazyAuthPage("agent-consent"),
            },
            {
              Component: SuspenseLayout,
              children: [
                {
                  index: true,
                  element: (
                    <IndexRedirect initialLocationKey={initialLocationKey} />
                  ),
                },
                {
                  path: "settings",
                  lazy: async () => {
                    const { SettingsPage } = await import(
                      "@repo/features/settings/page"
                    );
                    return {
                      Component: () => (
                        <SettingsPage
                          buildVersion={<AppBuildVersion />}
                          shell={shell}
                        />
                      ),
                    };
                  },
                  children: createSettingsChildRoutes(
                    shell,
                    runtime?.cookieSettingsLink
                  ),
                },
                {
                  path: ":organizationSlug",
                  Component: OrganizationScopeGate,
                  children: [
                    ...toolRoutes,
                    {
                      path: "settings",
                      lazy: async () => {
                        const { OrganizationSettingsPage } = await import(
                          "@repo/features/organization"
                        );
                        function OrganizationSettingsRoute() {
                          const handleLogout = useLogout();
                          return (
                            <OrganizationSettingsPage onLogout={handleLogout} />
                          );
                        }
                        return {
                          Component: OrganizationSettingsRoute,
                        };
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
};

const AppRouter = ({ runtime, shell }: AppRouterProps) => {
  const authCallbackBaseUrl = runtime?.authCallbackBaseUrl;
  const cookieSettingsLink = runtime?.cookieSettingsLink;
  const createRegionClients = runtime?.createRegionClients;
  const router = useMemo(
    () =>
      createAppRouter(shell, {
        authCallbackBaseUrl,
        cookieSettingsLink,
        createRegionClients,
      }),
    [authCallbackBaseUrl, cookieSettingsLink, createRegionClients, shell]
  );
  return <RouterProvider router={router} />;
};
export default AppRouter;
