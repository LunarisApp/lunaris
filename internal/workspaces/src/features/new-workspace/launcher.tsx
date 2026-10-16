import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuShortcut,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
import { Obsidian } from "@lunarisapp/ui/brand-icons";
import {
  BookOpen01Icon,
  FolderAddIcon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateWorkspace } from "@repo/workspaces/permissions";

export interface CreateWorkspaceLauncherOption {
  description: string;
  disabled: boolean;
  icon: ReactNode;
  id: "empty" | "obsidian" | "templates";
  label: string;
  shortcut?: string;
}

interface CreateWorkspaceLauncherProps {
  align?: "center" | "end" | "start";
  onCreateEmpty: () => void;
  onImportObsidian: () => void;
  trigger: ReactElement;
}

export function CreateWorkspaceLauncher({
  align = "start",
  onCreateEmpty,
  onImportObsidian,
  trigger,
}: CreateWorkspaceLauncherProps) {
  const { t } = useTranslation();
  const canCreate = useCanCreateWorkspace();

  const options: CreateWorkspaceLauncherOption[] = [
    {
      id: "empty",
      label: t("workspaces.createEmpty"),
      description: t("workspaces.createEmptyDescription"),
      icon: <HugeiconsIcon aria-hidden="true" icon={FolderAddIcon} />,
      disabled: !canCreate,
    },
    {
      id: "obsidian",
      label: t("workspaces.importFromObsidian"),
      description: t("workspaces.importFromObsidianDescription"),
      icon: <Obsidian aria-hidden="true" className="size-4" />,
      disabled: !canCreate,
    },
    {
      id: "templates",
      label: t("workspaces.browseTemplates"),
      description: t("common.comingSoon"),
      icon: <HugeiconsIcon aria-hidden="true" icon={BookOpen01Icon} />,
      disabled: true,
    },
  ];

  return (
    <ResponsiveDropdownMenu>
      <ResponsiveDropdownMenuTrigger render={trigger} />
      <ResponsiveDropdownMenuContent
        align={align}
        className="w-72"
        title={t("workspaces.createWorkspace")}
      >
        {options.map((option) => (
          <ResponsiveDropdownMenuItem
            className="py-2"
            data-testid={
              option.id === "empty"
                ? "workspaces-create-option-empty"
                : undefined
            }
            disabled={option.disabled}
            key={option.id}
            onClick={
              option.disabled
                ? undefined
                : option.id === "obsidian"
                  ? onImportObsidian
                  : onCreateEmpty
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              {option.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{option.label}</span>
              <span className="text-muted-foreground text-xs">
                {option.description}
              </span>
            </span>
            {!!option.shortcut && (
              <ResponsiveDropdownMenuShortcut>
                {option.shortcut}
              </ResponsiveDropdownMenuShortcut>
            )}
          </ResponsiveDropdownMenuItem>
        ))}
      </ResponsiveDropdownMenuContent>
    </ResponsiveDropdownMenu>
  );
}
