import { AgentWorkLauncher } from "../features/agent-work/launcher";
import { Input } from "@lunarisapp/ui/components/input";
import {
  Cancel01Icon,
  File01Icon,
  FileSearchIcon,
  HugeiconsIcon,
  Search01Icon,
} from "@lunarisapp/ui/icons";
import { MobileHeader } from "@repo/features/mobile";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import {
  WorkspaceExplorerTree,
  WorkspaceTrashButton,
  useWorkspaceResourcesMap,
} from "@repo/workspaces/workspace-explorer";
import {
  useResourceContentSearch,
  useResourceSearch,
} from "@repo/workspaces/search";
import SyncStatusIndicator from "@repo/features/sync-status";
import { MobileUserMenu } from "@repo/features/user-menu";
import { useOrganizationNavigation } from "@repo/workspaces/organization-navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { AppUpdateButton } from "@repo/features/app-update";
import { ExtensionViewLaunchers } from "../components/extension-view-launchers";
import { useLogout } from "@repo/features/auth/use-logout";
import { useWorkspaceBrowserTitle } from "./workspace-browser-title";

// ---------------------------------------------------------------------------
// Search Results
// ---------------------------------------------------------------------------

function MobileSearchResults({ query }: { query: string }) {
  const resourceResults = useResourceSearch(query);
  const contentResults = useResourceContentSearch(query);
  const { openResource } = useOrganizationNavigation();
  const resources = useWorkspaceResourcesMap();
  const { t } = useTranslation();

  const uniqueContentResults = contentResults.filter(
    (cr) => !resourceResults.some((dr) => dr.resourceId === cr.resourceId)
  );

  const allResults = [...resourceResults, ...uniqueContentResults];

  if (allResults.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {t("search.noResults")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2">
      {allResults.map((result) => (
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors active:bg-accent"
          key={result.id}
          onClick={() => {
            if (!(result.pluginId && result.resourceId)) {
              return;
            }
            openResource({
              resourceId: result.resourceId,
              resourceTypeId: result.pluginId,
              title: result.label,
              schemaVersion:
                resources.get(result.resourceId)?.schema_version ?? 1,
            });
          }}
          type="button"
        >
          <HugeiconsIcon
            className="size-4 shrink-0 text-muted-foreground"
            icon={result.type === "resource" ? File01Icon : FileSearchIcon}
          />
          <span className="truncate">{result.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Explorer Page
// ---------------------------------------------------------------------------

export default function MobileExplorerPage() {
  const { t } = useTranslation();
  const handleLogout = useLogout();
  const { workspace } = useCurrentWorkspace();
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const [query, setQuery] = useState("");
  const isSearching = query.trim().length > 0;
  const backTo = organizationSlug ? `/${organizationSlug}` : "/";
  useWorkspaceBrowserTitle();

  return (
    <div className="flex h-dvh flex-col">
      <MobileHeader
        actions={
          <div className="flex items-center gap-2">
            <AgentWorkLauncher />
            <ExtensionViewLaunchers />
            <MobileUserMenu onLogout={handleLogout} />
          </div>
        }
        backTo={backTo}
        title={workspace?.name || t("common.untitled")}
        titleTrailing={
          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <AppUpdateButton size="xs" />
          </div>
        }
      />

      {/* Content area: tree or search results */}
      <div className="flex min-h-0 flex-1 flex-col">
        {isSearching ? (
          <div className="flex-1 overflow-y-auto">
            <MobileSearchResults query={query} />
          </div>
        ) : (
          <WorkspaceExplorerTree className="px-1" />
        )}
      </div>

      {/* Fixed search bar at bottom */}
      <div className="shrink-0 border-t bg-background pt-2 pr-[calc(0.75rem+var(--safe-area-right))] pb-[calc(0.5rem+var(--safe-area-bottom))] pl-[calc(0.75rem+var(--safe-area-left))]">
        <div className="flex items-center gap-1">
          <WorkspaceTrashButton />
          <div className="relative flex-1">
            <HugeiconsIcon
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
            />
            <Input
              className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              type="search"
              value={query}
            />
            {isSearching && (
              <button
                className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-muted-foreground"
                onClick={() => setQuery("")}
                type="button"
              >
                <HugeiconsIcon className="size-4" icon={Cancel01Icon} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
