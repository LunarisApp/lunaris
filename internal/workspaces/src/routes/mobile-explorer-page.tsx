import { AgentWorkLauncher } from "../features/agent-work/launcher";
import { MobileHeader } from "@repo/features/mobile";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import {
  WorkspaceExplorerTree,
  WorkspaceTrashButton,
} from "@repo/workspaces/workspace-explorer";
import { SearchButton } from "@repo/workspaces/search";
import SyncStatusIndicator from "@repo/features/sync-status";
import { MobileUserMenu } from "@repo/features/user-menu";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { AppUpdateButton } from "@repo/features/app-update";
import { ExtensionViewLaunchers } from "../components/extension-view-launchers";
import { useLogout } from "@repo/features/auth/use-logout";
import { useWorkspaceBrowserTitle } from "./workspace-browser-title";

export default function MobileExplorerPage() {
  const { t } = useTranslation();
  const handleLogout = useLogout();
  const { workspace } = useCurrentWorkspace();
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
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

      <div className="shrink-0 pt-4 pr-[calc(1rem+var(--safe-area-right))] pb-3 pl-[calc(1rem+var(--safe-area-left))]">
        <SearchButton className="h-12 w-full justify-start" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
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
      </div>
    </div>
  );
}
