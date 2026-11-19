/** @vitest-environment happy-dom */

import type { ItemInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lunarisapp/ui/components/context-menu", () => ({
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ContextMenuSeparator: () => <div role="separator" />,
}));

vi.mock("@lunarisapp/ui/components/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => <>{children}</>,
  DrawerMenuItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  Copy01Icon: {},
  Delete02Icon: {},
  Edit02Icon: {},
  FolderAddIcon: {},
  FileAddIcon: {},
  HugeiconsIcon: () => null,
  Link02Icon: {},
  MoreVerticalIcon: {},
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./context-menu-config", () => ({
  AddFolderMenuItem: () => null,
  AddResourceMenuItem: () => null,
  CopyPathMenuItem: () => null,
  CopyUrlMenuItem: () => null,
  DeleteMenuItem: () => null,
  DuplicateMenuItem: () => null,
  RenameMenuItem: () => null,
}));

import { MobileWorkspaceTreeItemActions } from "./workspace-tree-item-actions";

function makeItem(isFolder: boolean): ItemInstance<WorkspaceResourceEntity> {
  return {
    isFolder: () => isFolder,
    startRenaming: vi.fn(),
  } as unknown as ItemInstance<WorkspaceResourceEntity>;
}

function renderActions(isFolder: boolean) {
  render(
    <MobileWorkspaceTreeItemActions
      canCreate
      canDelete
      canDuplicate={false}
      canUpdate
      item={makeItem(isFolder)}
      onAddFolder={vi.fn()}
      onAddResource={vi.fn()}
      onCopyPath={vi.fn()}
      onCopyUrl={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
    />
  );
}

describe("MobileWorkspaceTreeItemActions", () => {
  it("exposes visual dividers as separators", () => {
    renderActions(false);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("includes folder-action separator for folders", () => {
    renderActions(true);
    expect(screen.getAllByRole("separator")).toHaveLength(3);
  });
});
