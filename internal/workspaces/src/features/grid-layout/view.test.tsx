import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { GridLayoutProvider, useGridLayoutStoreState } from "./context";
import { MAIN_GROUP_ID } from "./types";
import { GridLayoutView } from "./view";

vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openResource: vi.fn() }),
}));
vi.mock("./components/empty-panel", () => ({
  GridLayoutEmptyPanel: () => null,
}));
vi.mock("./components/group-controls", () => ({
  GridLayoutGroupControls: () => null,
}));
vi.mock("./components/tab", () => ({ GridLayoutTab: () => null }));
vi.mock("./hooks/use-close-active-panel", () => ({
  useCloseActivePanel: () => undefined,
}));
vi.mock("./hooks/use-move-active-panel-to-window", () => ({
  useMoveActivePanelToWindow: () => undefined,
}));
vi.mock("./hooks/use-new-tab-hotkey", () => ({
  useNewTabHotkey: () => undefined,
}));

function WorkspaceHarness({ visible = true }: { visible?: boolean }) {
  const { addGroup, addPanel, dockviewApi, register } =
    useGridLayoutStoreState();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;
    register("test", "workspace", () => <div>Workspace content</div>);
    addGroup({ id: MAIN_GROUP_ID, direction: "right" });
    addPanel({
      pluginId: "test",
      renderer: "workspace",
      title: "Workspace",
      position: { referenceGroup: MAIN_GROUP_ID },
    });
  }, [addGroup, addPanel, register]);

  return (
    <>
      <span data-testid="dockview-state">
        {dockviewApi ? "ready" : "pending"}
      </span>
      {visible ? <GridLayoutView /> : null}
    </>
  );
}

describe("GridLayoutView lifecycle", () => {
  it("preserves workspace panes through StrictMode effect replay", async () => {
    render(
      <StrictMode>
        <GridLayoutProvider>
          <WorkspaceHarness />
        </GridLayoutProvider>
      </StrictMode>
    );

    await screen.findByText("Workspace content");
    expect(screen.getByTestId("dockview-state").textContent).toBe("ready");
  });

  it("releases the API when the view unmounts", async () => {
    const view = render(
      <GridLayoutProvider>
        <WorkspaceHarness />
      </GridLayoutProvider>
    );
    await screen.findByText("Workspace content");

    view.rerender(
      <GridLayoutProvider>
        <WorkspaceHarness visible={false} />
      </GridLayoutProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("dockview-state").textContent).toBe("pending")
    );
    expect(screen.queryByText("Workspace content")).toBeNull();
  });
});
