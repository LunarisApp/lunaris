/** @vitest-environment happy-dom */

import type { ItemInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ExtensionRegistryProvider } from "../../extensions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  WorkspaceResourceIcon,
  WorkspaceTreeItemLabel,
} from "./workspace-tree-item-content";

const extensionResource: WorkspaceResourceEntity = {
  id: "resource-1",
  workspace_id: "workspace-1",
  name: "Board",
  icon: null,
  position: 0,
  parent_id: null,
  resource_type_id: "lunaris.kanban",
  schema_version: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function withExtensionRegistry(
  children: ReactNode,
  enabledExtensionIds: readonly string[]
) {
  return (
    <ExtensionRegistryProvider
      allExtensionIds={enabledExtensionIds}
      enabledExtensionIds={enabledExtensionIds}
      extensionAvailability={Object.fromEntries(
        enabledExtensionIds.map((id) => [id, "available" as const])
      )}
      extensionMetadata={{}}
    >
      {children}
    </ExtensionRegistryProvider>
  );
}

describe("WorkspaceTreeItemLabel", () => {
  it("renders read-only items without renaming feature methods", () => {
    const item = {
      getItemName: () => "Viewer document",
    } as ItemInstance<WorkspaceResourceEntity>;

    render(<WorkspaceTreeItemLabel item={item} />);

    expect(screen.getByText("Viewer document").textContent).toBe(
      "Viewer document"
    );
  });
});

describe("WorkspaceResourceIcon", () => {
  it("replaces spinner with extension icon when resource type loads", () => {
    const { rerender } = render(
      withExtensionRegistry(
        <WorkspaceResourceIcon item={extensionResource} />,
        ["lunaris.kanban"]
      )
    );

    expect(screen.getByRole("status")).toBeTruthy();

    rerender(
      withExtensionRegistry(
        <WorkspaceResourceIcon
          item={extensionResource}
          resourceIcon={<svg data-testid="extension-icon" />}
        />,
        ["lunaris.kanban"]
      )
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("extension-icon")).toBeTruthy();
  });

  it("uses unknown icon when extension is not installed", () => {
    const { container } = render(
      withExtensionRegistry(
        <WorkspaceResourceIcon item={extensionResource} />,
        []
      )
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
