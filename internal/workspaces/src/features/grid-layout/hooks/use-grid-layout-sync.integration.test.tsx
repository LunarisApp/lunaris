/** @vitest-environment happy-dom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { DockviewApi } from "dockview";
import { DockviewReact } from "dockview-react";
import { useEffect, useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  GridLayoutProvider,
  useGridLayoutStore,
  useGridLayoutStoreState,
} from "../context";
import { createEmptyPanelDefinition } from "../empty-panel";
import { LEFT_GROUP_ID, MAIN_GROUP_ID } from "../types";
import { useGridLayoutSync } from "./use-grid-layout-sync";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
afterEach(cleanup);

function Harness({ empty }: { empty: boolean }) {
  const state = useGridLayoutStoreState();
  const dockviewRef = useRef<DockviewApi | null>(null);
  const initialized = useRef(false);
  const panels = useGridLayoutStore((value) => value.panels);
  useGridLayoutSync({
    dockviewRef,
    panels,
    groups: state.groups,
    componentRenderers: state.componentRenderers,
    getOrCreateRenderer: state.getOrCreateRenderer,
    markPanelActive: state.markPanelActive,
    removeGroup: state.removeGroup,
    removePanel: state.removePanel,
  });
  useEffect(() => {
    if (!state.dockviewApi || initialized.current) return;
    initialized.current = true;
    state.register("test", "explorer", () => <div>Explorer content</div>);
    state.register("test", "resource", () => (
      <textarea aria-label="Resource draft" defaultValue="Unsaved text" />
    ));
    state.register("grid-layout", "empty-panel", () => (
      <div>Start content</div>
    ));
    state.register("system-agent-work", "agent-work", () => (
      <div>Agent content</div>
    ));
    state.addGroup({ id: MAIN_GROUP_ID, direction: "right" });
    state.addGroup({
      id: LEFT_GROUP_ID,
      referenceGroup: MAIN_GROUP_ID,
      direction: "left",
    });
    state.addPanel({
      pluginId: "test",
      renderer: "explorer",
      title: "Explorer",
      position: { referenceGroup: LEFT_GROUP_ID },
    });
    state.addPanel(
      empty
        ? createEmptyPanelDefinition({
            groupId: MAIN_GROUP_ID,
            initial: true,
            title: "New tab",
          })
        : {
            pluginId: "test",
            renderer: "resource",
            title: "Notes",
            params: { viewId: "resource-notes" },
            position: { referenceGroup: MAIN_GROUP_ID },
          },
    );
  }, [state]);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          state.openToolPanel({
            pluginId: "system-agent-work",
            renderer: "agent-work",
            toolId: "agent-work",
            title: "Agent Work",
            target: { direction: "right" },
          })
        }
      >
        Open agent
      </button>
      <button
        type="button"
        onClick={() => state.openToolPanel({
          pluginId: "system-agent-work",
          renderer: "agent-work",
          toolId: "agent-work",
          title: "Agent Work",
        })}
      >
        Focus agent
      </button>
      <button
        type="button"
        onClick={() => state.addGroup({ id: "temporary", direction: "below" })}
      >
        Add group
      </button>
      <button type="button" onClick={() => state.removeGroup("temporary")}>
        Remove group
      </button>
      <DockviewReact
        components={state.componentRenderers}
        onReady={({ api }) => {
          dockviewRef.current = api;
          api.layout(1280, 720);
          state.setDockviewApi(api);
        }}
      />
    </>
  );
}

it.each([true, false])(
  "preserves content and the Agent Work split across group sync (empty: %s)",
  async (empty) => {
    render(
      <GridLayoutProvider>
        <Harness empty={empty} />
      </GridLayoutProvider>,
    );
    await waitFor(() =>
      expect(
        empty
          ? screen.getByText("Start content")
          : screen.getByRole("textbox", { name: "Resource draft" }),
      ).toBeTruthy(),
    );
    const draft = empty
      ? null
      : screen.getByRole("textbox", { name: "Resource draft" });
    if (draft) fireEvent.change(draft, { target: { value: "Still editing" } });
    fireEvent.click(screen.getByRole("button", { name: "Open agent" }));
    await act(async () => {});
    expect(screen.getByText("Agent content")).toBeTruthy();
    expect(
      empty
        ? screen.getByText("Start content")
        : screen.getByRole("textbox", { name: "Resource draft" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    await act(async () => {});
    expect(screen.getByText("Agent content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove group" }));
    await act(async () => {});
    expect(screen.getByText("Agent content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open agent" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Focus agent" }));
    await act(async () => {});
    expect(screen.getAllByText("Agent content")).toHaveLength(1);
    expect(
      empty
        ? screen.getByText("Start content")
        : screen.getByRole("textbox", { name: "Resource draft" }),
    ).toBeTruthy();
    if (draft) {
      expect(screen.getByRole("textbox", { name: "Resource draft" })).toBe(
        draft,
      );
      expect((draft as HTMLTextAreaElement).value).toBe("Still editing");
    }
  },
);
