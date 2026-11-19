import {
  ContextMenuItem,
  ContextMenuShortcut,
} from "@lunarisapp/ui/components/context-menu";
import {
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  FileAddIcon,
  FolderAddIcon,
  HugeiconsIcon,
  Link02Icon,
} from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";
import { formatHotkeyDisplay } from "@repo/features/hotkeys";

export function AddResourceMenuItem({
  onAddResource,
}: {
  onAddResource: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem aria-haspopup="dialog" onClick={onAddResource}>
      <HugeiconsIcon icon={FileAddIcon} />
      {t("explorer.addResource")}
    </ContextMenuItem>
  );
}

// --- Add Folder Menu Item ---

export interface AddFolderMenuItemProps {
  onAddFolder: () => void;
}

export function AddFolderMenuItem({ onAddFolder }: AddFolderMenuItemProps) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem onClick={onAddFolder}>
      <HugeiconsIcon icon={FolderAddIcon} />
      {t("explorer.addFolder")}
    </ContextMenuItem>
  );
}

// --- Copy Path Menu Item ---

export interface CopyPathMenuItemProps {
  onCopyPath: () => void;
}

export function CopyPathMenuItem({ onCopyPath }: CopyPathMenuItemProps) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem onClick={onCopyPath}>
      <HugeiconsIcon icon={Copy01Icon} />
      {t("explorer.copyPath")}
    </ContextMenuItem>
  );
}

// --- Copy URL Menu Item ---

export interface CopyUrlMenuItemProps {
  onCopyUrl: () => void;
}

export function CopyUrlMenuItem({ onCopyUrl }: CopyUrlMenuItemProps) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem onClick={onCopyUrl}>
      <HugeiconsIcon icon={Link02Icon} />
      {t("explorer.copyUrl")}
    </ContextMenuItem>
  );
}

// --- Duplicate Menu Item ---

export function DuplicateMenuItem({
  onDuplicate,
}: {
  onDuplicate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem onClick={onDuplicate}>
      <HugeiconsIcon icon={Copy01Icon} />
      {t("common.duplicate")}
    </ContextMenuItem>
  );
}

// --- Rename Menu Item ---

export interface RenameMenuItemProps {
  onRename: () => void;
}

export function RenameMenuItem({ onRename }: RenameMenuItemProps) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem onClick={onRename}>
      <HugeiconsIcon icon={Edit02Icon} />
      {t("common.rename")}
      <ContextMenuShortcut>
        {formatHotkeyDisplay("rename-resource")}
      </ContextMenuShortcut>
    </ContextMenuItem>
  );
}

// --- Delete Menu Item ---

export interface DeleteMenuItemProps {
  onDelete: () => void;
}

export function DeleteMenuItem({ onDelete }: DeleteMenuItemProps) {
  const { t } = useTranslation();
  return (
    <ContextMenuItem onClick={onDelete} variant="destructive">
      <HugeiconsIcon icon={Delete02Icon} />
      {t("common.delete")}
      <ContextMenuShortcut>
        {formatHotkeyDisplay("delete-resource")}
      </ContextMenuShortcut>
    </ContextMenuItem>
  );
}
