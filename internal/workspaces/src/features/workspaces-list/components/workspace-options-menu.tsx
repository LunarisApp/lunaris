import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Delete02Icon,
  HugeiconsIcon,
  MoreVerticalIcon,
  Settings01Icon,
} from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";

interface WorkspaceOptionsMenuProps {
  canDelete: boolean;
  onDelete: () => void;
  onSettings: () => void;
  workspaceName: string;
}

export function WorkspaceOptionsMenu({
  canDelete,
  onDelete,
  onSettings,
  workspaceName,
}: WorkspaceOptionsMenuProps) {
  const { t } = useTranslation();
  return (
    <ResponsiveDropdownMenu>
      <ResponsiveDropdownMenuTrigger
        render={
          <Button
            aria-label={`${t("common.actions")}: ${workspaceName}`}
            data-testid="workspaces-options-trigger"
            size="icon-sm"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden="true" icon={MoreVerticalIcon} />
          </Button>
        }
      />
      <ResponsiveDropdownMenuContent
        align="end"
        title={`${t("common.actions")}: ${workspaceName}`}
      >
        <ResponsiveDropdownMenuItem
          data-testid="workspaces-options-settings"
          onClick={onSettings}
        >
          <HugeiconsIcon aria-hidden="true" icon={Settings01Icon} />
          {t("common.settings")}
        </ResponsiveDropdownMenuItem>
        {canDelete && (
          <ResponsiveDropdownMenuItem
            data-testid="workspaces-options-delete"
            onClick={onDelete}
            variant="destructive"
          >
            <HugeiconsIcon aria-hidden="true" icon={Delete02Icon} />
            {t("common.delete")}
          </ResponsiveDropdownMenuItem>
        )}
      </ResponsiveDropdownMenuContent>
    </ResponsiveDropdownMenu>
  );
}
