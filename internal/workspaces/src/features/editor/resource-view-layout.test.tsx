import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileResourceHeaderContext } from "./mobile-resource-header";
import { ResourceViewLayout } from "./resource-view-layout";

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceViewPresenceScope: () => null,
}));
vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace_1" }),
}));
vi.mock("../../extensions/host/file-transfer-status", () => ({
  FileTransferStatus: () => null,
}));
vi.mock("../grid-layout/context", () => ({
  useGridLayoutStore: (select: (state: unknown) => unknown) =>
    select({ isFocusMode: false, focusModeWidth: 800 }),
}));
vi.mock("./breadcrumb", () => ({
  EditorBreadcrumb: () => <span>Breadcrumb</span>,
}));
vi.mock("./edited-timestamp", () => ({
  EditedTimestamp: ({ resourceId }: { resourceId: string }) => (
    <span>Edited {resourceId}</span>
  ),
}));
vi.mock("./options", () => ({
  EditorOptions: () => <button type="button">Resource actions</button>,
}));
vi.mock("./focus-mode-width-handle", () => ({
  FocusModeWidthHandle: () => null,
}));

const resource = {
  parentId: null,
  resourceId: "resource_1",
  resourceTypeId: "lunaris.rich-text",
  schemaVersion: 1,
};
const storage = { content: { kind: "yjs" as const, storageId: "storage_1" } };
afterEach(cleanup);

describe("resource view header", () => {
  it("renders desktop metadata and actions beside the breadcrumb", () => {
    render(
      <ResourceViewLayout resource={resource} storage={storage}>
        Content
      </ResourceViewLayout>
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Breadcrumb")).toBeTruthy();
    expect(within(header).getByText("Edited resource_1")).toBeTruthy();
    expect(
      within(header).getByRole("button", { name: "Resource actions" })
    ).toBeTruthy();
  });

  it("moves mobile chrome into route slots and removes it on unmount", () => {
    const actions = document.createElement("div");
    const metadata = document.createElement("div");
    const view = render(
      <MobileResourceHeaderContext.Provider value={{ actions, metadata }}>
        <ResourceViewLayout resource={resource} storage={storage}>
          Content
        </ResourceViewLayout>
      </MobileResourceHeaderContext.Provider>
    );
    expect(screen.queryByRole("banner")).toBeNull();
    expect(
      within(actions).getByRole("button", { name: "Resource actions" })
    ).toBeTruthy();
    expect(metadata.textContent).toBe("Edited resource_1");
    expect(screen.getByText("Content")).toBeTruthy();
    view.unmount();
    expect(actions.childElementCount).toBe(0);
    expect(metadata.childElementCount).toBe(0);
  });
});
