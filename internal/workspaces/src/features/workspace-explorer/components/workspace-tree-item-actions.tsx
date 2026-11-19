import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  ContextMenuContent,
  ContextMenuSeparator,
} from "@lunarisapp/ui/components/context-menu";
import {
  Drawer,
  DrawerMenuItem,
  DrawerTitle,
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
import { Button } from "@lunarisapp/ui/components/button";
import { Separator } from "@lunarisapp/ui/components/separator";
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
          <Button
            className="touch-target text-muted-foreground"
            size="icon"
            variant="ghost"
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon className="size-4" icon={MoreVerticalIcon} />
            <span className="sr-only">{t("common.actions")}</span>
          </Button>
        }
      />
      <DrawerContent aria-describedby={undefined}>
        <DrawerTitle className="sr-only">{t("common.actions")}</DrawerTitle>
        <div className="flex flex-col gap-0.5 px-2 py-4">
          {!!(isFolderItem && canCreate) && (
            <>
              {resources.map((resource) => (
                <DrawerMenuItem
                  key={resource.resourceTypeId}
                  onClick={() => onAddItem(resource)}
                >
                  <Icon className="size-5" icon={resource.icon} />
                  {resource.name}
                </DrawerMenuItem>
              ))}
              <DrawerMenuItem onClick={onAddFolder}>
                <Icon icon={FolderAddIcon} />
                {t("explorer.addFolder")}
              </DrawerMenuItem>
              <Separator className="my-1" />
            </>
          )}
          <DrawerMenuItem onClick={onCopyPath}>
            <Icon icon={Copy01Icon} />
            {t("explorer.copyPath")}
          </DrawerMenuItem>
          <DrawerMenuItem onClick={onCopyUrl}>
            <Icon icon={Link02Icon} />
            {t("explorer.copyUrl")}
          </DrawerMenuItem>
          <Separator className="my-1" />
          {!!canDuplicate && (
            <DrawerMenuItem onClick={onDuplicate}>
              <Icon icon={Copy01Icon} />
              {t("common.duplicate")}
            </DrawerMenuItem>
          )}
          {!!canUpdate && (
            <DrawerMenuItem onClick={item.startRenaming}>
              <Icon icon={Edit02Icon} />
              {t("common.rename")}
            </DrawerMenuItem>
          )}
          {!!canDelete && (
            <>
              <Separator className="my-1" />
              <DrawerMenuItem variant="destructive" onClick={onDelete}>
                <Icon icon={Delete02Icon} />
                {t("common.delete")}
              </DrawerMenuItem>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
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
      {!!(isFolderItem && canCreate) && (
        <>
          <AddItemSubmenu resources={resources} onAddItem={onAddItem} />
          <AddFolderMenuItem onAddFolder={onAddFolder} />
          <ContextMenuSeparator />
        </>
      )}
      <CopyPathMenuItem onCopyPath={onCopyPath} />
      <CopyUrlMenuItem onCopyUrl={onCopyUrl} />
      <ContextMenuSeparator />
      {!!canDuplicate && <DuplicateMenuItem onDuplicate={onDuplicate} />}
      {!!canUpdate && <RenameMenuItem onRename={item.startRenaming} />}
      {!!canDelete && (
        <>
          <ContextMenuSeparator />
          <DeleteMenuItem onDelete={onDelete} />
        </>
      )}
    </ContextMenuContent>
  );
}
