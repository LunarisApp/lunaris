import { AgentWorkLauncher } from "../features/agent-work/launcher";
import { Button } from "@lunarisapp/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupClearButton,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
import {
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
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-base text-muted-foreground">
        {t("search.noResults")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {allResults.map((result) => (
        <Button
          variant="ghost"
          className="min-h-14 justify-start gap-3 text-start text-base"
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
        </Button>
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
    <div className="flex h-dvh flex-col overflow-hidden bg-muted/30">
      <MobileHeader
        actions={<MobileUserMenu onLogout={handleLogout} />}
        backTo={backTo}
        title={workspace?.name || t("common.untitled")}
        titleTrailing={
          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <AppUpdateButton size="xs" />
          </div>
        }
      />

      {/* Search stays beside the resource list, above the keyboard. */}
      <div className="shrink-0 pt-4 pr-[calc(1rem+var(--safe-area-right))] pb-3 pl-[calc(1rem+var(--safe-area-left))]">
        <InputGroup className="h-12">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("common.search")}
            className="h-full"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.search")}
            type="search"
            value={query}
          />
          {query.length > 0 && (
            <InputGroupClearButton
              aria-label={t("explorer.clearSearch")}
              className="touch-target"
              onClear={() => setQuery("")}
              size="icon-sm"
            />
          )}
        </InputGroup>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {isSearching ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4">
            <MobileSearchResults query={query} />
          </div>
        ) : (
          <WorkspaceExplorerTree
            className="min-h-0"
            footerActions={
              <>
                <WorkspaceTrashButton />
                <AgentWorkLauncher />
                <ExtensionViewLaunchers />
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
