import {
  type ResourceTypeDefinition,
  type PluginIconSource,
} from "@lunarisapp/plugin-sdk";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  ContextMenuContent,
  ContextMenuSeparator,
} from "@lunarisapp/ui/components/context-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@lunarisapp/ui/components/drawer";
import type { ItemInstance } from "@lunarisapp/ui/components/tree";
import {
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  FolderAddIcon,
  HugeiconsIcon,
  Link02Icon,
  MoreVerticalIcon,
} from "@lunarisapp/ui/icons";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AddFolderMenuItem,
  AddItemSubmenu,
  CopyPathMenuItem,
  CopyUrlMenuItem,
  DeleteMenuItem,
  DuplicateMenuItem,
  RenameMenuItem,
} from "./context-menu-config";

interface WorkspaceTreeItemActionsProps {
  canCreate: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canUpdate: boolean;
  item: ItemInstance<WorkspaceResourceEntity>;
  onAddFolder: () => void;
  onAddItem: (resource: ResourceTypeDefinition) => void;
  onCopyPath: () => void;
  onCopyUrl: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  resources: ResourceTypeDefinition[];
}

export function MobileWorkspaceTreeItemActions({
  canCreate,
  canDelete,
  canDuplicate,
  canUpdate,
  item,
  resources,
  onAddFolder,
  onAddItem,
  onCopyPath,
  onCopyUrl,
  onDelete,
  onDuplicate,
}: WorkspaceTreeItemActionsProps) {
  const { t } = useTranslation();
  const isFolderItem = item.isFolder();

  return (
    <Drawer>
      <DrawerTrigger
        render={
          <button
            className="shrink-0 p-1 rounded-sm text-muted-foreground active:bg-accent"
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon className="size-4" icon={MoreVerticalIcon} />
            <span className="sr-only">{t("common.actions")}</span>
          </button>
        }
      />
      <DrawerContent>
        <div className="flex flex-col gap-0.5 px-2 py-4">
          {isFolderItem && canCreate && (
            <>
              {resources.map((resource) => (
                <DrawerMenuItem
                  icon={resource.icon}
                  key={resource.resourceTypeId}
                  onClick={() => onAddItem(resource)}
                >
                  {resource.name}
                </DrawerMenuItem>
              ))}
              <DrawerMenuItem icon={FolderAddIcon} onClick={onAddFolder}>
                {t("explorer.addFolder")}
              </DrawerMenuItem>
              <DrawerMenuSeparator />
            </>
          )}
          <DrawerMenuItem icon={Copy01Icon} onClick={onCopyPath}>
            {t("explorer.copyPath")}
          </DrawerMenuItem>
          <DrawerMenuItem icon={Link02Icon} onClick={onCopyUrl}>
            {t("explorer.copyUrl")}
          </DrawerMenuItem>
          <DrawerMenuSeparator />
          {canDuplicate && (
            <DrawerMenuItem icon={Copy01Icon} onClick={onDuplicate}>
              {t("common.duplicate")}
            </DrawerMenuItem>
          )}
          {canUpdate && (
            <DrawerMenuItem icon={Edit02Icon} onClick={item.startRenaming}>
              {t("common.rename")}
            </DrawerMenuItem>
          )}
          {canDelete && (
            <>
              <DrawerMenuSeparator />
              <DrawerMenuItem
                destructive
                icon={Delete02Icon}
                onClick={onDelete}
              >
                {t("common.delete")}
              </DrawerMenuItem>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DrawerMenuSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />;
}

function DrawerMenuItem({
  children,
  destructive,
  icon,
  onClick,
}: {
  children: ReactNode;
  destructive?: boolean;
  icon: PluginIconSource;
  onClick: () => void;
}) {
  return (
    <DrawerClose
      render={
        <button
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors active:bg-accent ${destructive ? "text-destructive" : ""}`}
          onClick={onClick}
          type="button"
        >
          <Icon className="size-5" icon={icon} />
          {children}
        </button>
      }
    />
  );
}

export function WorkspaceTreeItemContextMenuContent({
  canCreate,
  canDelete,
  canDuplicate,
  canUpdate,
  item,
  onAddFolder,
  onAddItem,
  onCopyPath,
  onCopyUrl,
  onDelete,
  onDuplicate,
  resources,
}: WorkspaceTreeItemActionsProps) {
  const isFolderItem = item.isFolder();

  return (
    <ContextMenuContent>
      {isFolderItem && canCreate && (
        <>
          <AddItemSubmenu resources={resources} onAddItem={onAddItem} />
          <AddFolderMenuItem onAddFolder={onAddFolder} />
          <ContextMenuSeparator />
        </>
      )}
      <CopyPathMenuItem onCopyPath={onCopyPath} />
      <CopyUrlMenuItem onCopyUrl={onCopyUrl} />
      <ContextMenuSeparator />
      {canDuplicate && <DuplicateMenuItem onDuplicate={onDuplicate} />}
      {canUpdate && <RenameMenuItem onRename={item.startRenaming} />}
      {canDelete && (
        <>
          <ContextMenuSeparator />
          <DeleteMenuItem onDelete={onDelete} />
        </>
      )}
    </ContextMenuContent>
  );
}
