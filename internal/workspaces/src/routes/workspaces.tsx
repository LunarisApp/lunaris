import { HomeSearchProvider } from "../features/search/components/home-search";
import { SearchButton } from "../features/search/components/search-button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@lunarisapp/ui/components/toggle-group";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import {
  Cancel01Icon,
  FolderAddIcon,
  GridViewIcon,
  HugeiconsIcon,
  ListViewIcon,
  Sorting01Icon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import { resolveSyncAccess, SYNC_ACCESS } from "@repo/auth/sync-access";
import { AnnouncementsBanner } from "@repo/features/announcements";
import { HelpCenterPopover } from "@repo/features/help-center";
import { CreateWorkspaceLauncher } from "@repo/workspaces/new-workspace/launcher";
import { useDefaultTemplateWorkspaceSeeder } from "@repo/workspaces/new-workspace/default-template/use-default-template-seeder";
import { usePermission } from "@repo/features/permissions";
import {
  useCanCreateWorkspace,
  useCanDeleteWorkspace,
} from "@repo/workspaces/permissions";
import {
  WorkspacesList,
  type WorkspacesSort,
  type WorkspacesView,
} from "@repo/workspaces/workspaces-list";
import { useRegionClients } from "@repo/features/region";
import { MobileUserMenu, UserMenu } from "@repo/features/user-menu";
import { OrganizationSelector } from "@repo/features/organization/components/organization-selector";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { log, parseError } from "evlog";
import { useTranslation } from "react-i18next";
import { AppUpdateButton } from "@repo/features/app-update";
import type { WorkspaceShell } from "./types";
import { useLogout } from "@repo/features/auth/use-logout";
import { useOrganizationPluginRuntime } from "../extensions/organization-runtime";
import { SkipLink } from "../components/skip-link";
import { useWorkspacePluginPreload } from "./workspace-plugin-preload";
import { preloadWorkspaceRoute } from "./workspace-route-preload";

const CreateWorkspaceDialog = lazy(() =>
  import("@repo/workspaces/new-workspace").then((module) => ({
    default: module.CreateWorkspaceDialog,
  }))
);
const ImportObsidianWorkspaceDialog = lazy(() =>
  import("@repo/workspaces/new-workspace").then((module) => ({
    default: module.ImportObsidianWorkspaceDialog,
  }))
);

const WORKSPACES_VIEW_STORAGE_KEY = "lunaris:workspaces-view";

export default function WorkspacesPage({ shell }: { shell: WorkspaceShell }) {
  const { t } = useTranslation();
  const { authClient } = useRegionClients();
  const handleLogout = useLogout();
  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [workspaceSort, setWorkspaceSort] =
    useState<WorkspacesSort>("activity");
  const [workspaceView, setWorkspaceView] = useState<WorkspacesView>(() => {
    try {
      return localStorage.getItem(WORKSPACES_VIEW_STORAGE_KEY) === "list"
        ? "list"
        : "grid";
    } catch {
      return "grid";
    }
  });
  const deniedInteractionMarked = useRef(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("mobile-banner-dismissed") === "true"
  );
  const pluginRegistry = useOrganizationPluginRuntime();
  const canReadWorkspaces = usePermission(permission.workspace.read);
  const canCreateWorkspace = useCanCreateWorkspace();
  const canUpdateWorkspace = usePermission(permission.workspace.update);
  const canDeleteWorkspace = useCanDeleteWorkspace();
  const canMutateWorkspaces =
    canCreateWorkspace || canUpdateWorkspace || canDeleteWorkspace;
  // RegionReady (wrapping the router) ensures authClient is non-null whenever
  // this page renders. Bang is a type-narrow only.
  const { data: activeOrg } = authClient!.useActiveOrganization();
  const { data: session } = authClient!.useSession();
  const isAnonymous = session?.user.isAnonymous ?? true;
  const canCreateCloudWorkspaces =
    resolveSyncAccess({ isAnonymous }) === SYNC_ACCESS.cloud;
  const preloadWorkspacePlugins = useWorkspacePluginPreload(
    pluginRegistry.allExtensionIds,
    {
      defaultExtensionIds: pluginRegistry.defaultExtensionIds,
      loadPlugin: pluginRegistry.loadPlugin,
    }
  );
  const handleWorkspaceIntent = useCallback(
    (workspace: { id: string }) => {
      void preloadWorkspaceRoute(shell).catch((error) => {
        log.debug({
          action: "workspace_route.preload",
          outcome: "failure",
          workspace: { id: workspace.id },
          route: { shell },
          error: parseError(error),
        });
      });
      preloadWorkspacePlugins(workspace.id);
    },
    [preloadWorkspacePlugins, shell]
  );
  const openCreateWorkspaceDialog = useCallback(() => setDialogOpen(true), []);
  const openImportWorkspaceDialog = useCallback(
    () => setImportDialogOpen(true),
    []
  );

  useDefaultTemplateWorkspaceSeeder({
    currentUserEmail: session?.user.email,
    organizationId: activeOrg?.id,
  });

  useEffect(() => {
    if (canReadWorkspaces || deniedInteractionMarked.current) {
      return;
    }
    deniedInteractionMarked.current = true;
    globalThis.performance?.mark("lunaris:workspaces-interactive");
  }, [canReadWorkspaces]);

  return (
    <>
      <SkipLink>{t("common.skipToContent")}</SkipLink>
      <div
        className="mx-auto w-full max-w-4xl px-4 py-4 md:px-6 md:py-12"
        data-testid="workspaces-page"
      >
        <div className="flex flex-col gap-4 md:gap-6">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2.5">
                <img
                  alt=""
                  className="size-8 shrink-0 dark:hidden"
                  draggable={false}
                  height={32}
                  src="/favicon-light.svg"
                  width={32}
                />
                <img
                  alt=""
                  className="hidden size-8 shrink-0 dark:block"
                  draggable={false}
                  height={32}
                  src="/favicon-dark.svg"
                  width={32}
                />
                <span className="font-[650] text-xl/none uppercase tracking-[0.04em]">
                  Lunaris
                </span>
              </div>
            </div>
            <div className="ml-auto flex min-w-0 max-w-full items-center gap-2 sm:gap-3">
              <AppUpdateButton />
              <OrganizationSelector />
              <HelpCenterPopover variant="secondary" />
              {isMobile ? (
                <MobileUserMenu onLogout={handleLogout} />
              ) : (
                <UserMenu onLogout={handleLogout} />
              )}
            </div>
          </header>

          {isMobile && !bannerDismissed && (
            <Alert variant="warning">
              <AlertDescription>
                {t("mobile.experienceBanner")}
              </AlertDescription>
              <button
                className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-sm opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => {
                  localStorage.setItem("mobile-banner-dismissed", "true");
                  setBannerDismissed(true);
                }}
                type="button"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-3.5"
                  icon={Cancel01Icon}
                />
                <span className="sr-only">{t("common.close")}</span>
              </button>
            </Alert>
          )}

          <AnnouncementsBanner />

          <main
            className="flex flex-col gap-4 focus:outline-none"
            id="main-content"
            tabIndex={-1}
          >
            <h1 className="font-semibold text-lg" id="workspaces-heading">
              {t("workspaces.recentWorkspaces")}
            </h1>
            {!canReadWorkspaces && (
              <Alert variant="destructive">
                <AlertTitle>{t("permissions.deniedTitle")}</AlertTitle>
                <AlertDescription>
                  {t("permissions.deniedDescription")}
                </AlertDescription>
              </Alert>
            )}
            {canReadWorkspaces && !canMutateWorkspaces && (
              <Alert>
                <AlertTitle>{t("permissions.readOnlyTitle")}</AlertTitle>
                <AlertDescription>
                  {t("permissions.readOnlyDescription")}
                </AlertDescription>
              </Alert>
            )}
            <div
              aria-label={t("workspaces.toolbar")}
              className="flex min-w-0 items-center gap-2"
              role="group"
            >
              {!!(canReadWorkspaces && activeOrg) && (
                <HomeSearchProvider
                  organizationId={activeOrg.id}
                  commandActions={
                    canCreateWorkspace
                      ? {
                          "create-workspace": openCreateWorkspaceDialog,
                          "import-workspace": openImportWorkspaceDialog,
                        }
                      : {}
                  }
                >
                  <SearchButton
                    className="min-w-16 flex-1 justify-start text-muted-foreground"
                    data-testid="workspaces-search"
                  />
                </HomeSearchProvider>
              )}
              {canReadWorkspaces && (
                <Select
                  onValueChange={(value) => {
                    if (value === "name" || value === "activity") {
                      setWorkspaceSort(value);
                    }
                  }}
                  value={workspaceSort}
                >
                  <SelectTrigger
                    aria-label={t("workspaces.sortBy")}
                    className="w-28 sm:w-36"
                    data-testid="workspaces-sort"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={Sorting01Icon}
                      strokeWidth={2}
                    />
                    <SelectValue>
                      {(value: WorkspacesSort | null) =>
                        value === "name"
                          ? t("workspaces.sortByName")
                          : t("workspaces.sortByActivity")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem
                      data-testid="workspaces-sort-activity"
                      value="activity"
                    >
                      {t("workspaces.sortByActivity")}
                    </SelectItem>
                    <SelectItem data-testid="workspaces-sort-name" value="name">
                      {t("workspaces.sortByName")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {canReadWorkspaces && (
                <ToggleGroup
                  aria-label={t("workspaces.view")}
                  onValueChange={(value) => {
                    const nextView = value[0];
                    if (nextView === "grid" || nextView === "list") {
                      setWorkspaceView(nextView);
                      try {
                        localStorage.setItem(
                          WORKSPACES_VIEW_STORAGE_KEY,
                          nextView
                        );
                      } catch {
                        // Layout selection still works when storage is unavailable.
                      }
                    }
                  }}
                  spacing={0}
                  value={[workspaceView]}
                  variant="outline"
                >
                  <ToggleGroupItem
                    aria-label={t("workspaces.gridView")}
                    data-testid="workspaces-view-grid"
                    title={t("workspaces.gridView")}
                    value="grid"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={GridViewIcon}
                      strokeWidth={2}
                    />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    aria-label={t("workspaces.listView")}
                    data-testid="workspaces-view-list"
                    title={t("workspaces.listView")}
                    value="list"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={ListViewIcon}
                      strokeWidth={2}
                    />
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              {canCreateWorkspace && (
                <CreateWorkspaceLauncher
                  align="end"
                  onCreateEmpty={openCreateWorkspaceDialog}
                  onImportObsidian={openImportWorkspaceDialog}
                  trigger={
                    <Button
                      aria-label={t("common.create")}
                      data-testid="workspaces-create-launcher-header"
                    >
                      <HugeiconsIcon aria-hidden="true" icon={FolderAddIcon} />
                      <span className="hidden sm:inline">
                        {t("common.create")}
                      </span>
                    </Button>
                  }
                />
              )}
            </div>
            {canReadWorkspaces && (
              <WorkspacesList
                createWorkspaceAction={
                  canCreateWorkspace ? (
                    <CreateWorkspaceLauncher
                      onCreateEmpty={openCreateWorkspaceDialog}
                      onImportObsidian={openImportWorkspaceDialog}
                      trigger={
                        <Button data-testid="workspaces-create-launcher-empty">
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={FolderAddIcon}
                          />
                          {t("common.create")}
                        </Button>
                      }
                    />
                  ) : undefined
                }
                onWorkspaceIntent={handleWorkspaceIntent}
                organizationId={activeOrg?.id}
                sortBy={workspaceSort}
                view={workspaceView}
                organizationSlug={activeOrg?.slug}
              />
            )}
          </main>
        </div>
        <Suspense fallback={null}>
          {!!(activeOrg && dialogOpen) && (
            <CreateWorkspaceDialog
              canCreateCloudWorkspaces={canCreateCloudWorkspaces}
              onOpenChange={setDialogOpen}
              open={dialogOpen}
              orgId={activeOrg.id}
            />
          )}
          {!!(activeOrg && importDialogOpen) && (
            <ImportObsidianWorkspaceDialog
              canCreateCloudWorkspaces={canCreateCloudWorkspaces}
              onOpenChange={setImportDialogOpen}
              open={importDialogOpen}
              orgId={activeOrg.id}
            />
          )}
        </Suspense>
      </div>
    </>
  );
}
