/** @vitest-environment happy-dom */

import { render } from "@testing-library/react";
import type { DockviewApi } from "dockview";
import { useCallback, useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Group, MAIN_GROUP_ID, type Panel } from "../types";
import { useGridLayoutSync } from "./use-grid-layout-sync";

const disposable = { dispose: vi.fn() };
const trackedPanel: Panel = {
  id: "document-panel",
  isUnloaded: false,
  lastActiveAt: 0,
  pluginId: "test",
  renderer: "content",
  title: "Document",
};

function createDockviewApi() {
  const dockviewGroups: Array<{ id: string }> = [];
  const dockviewPanels: Array<{ id: string; params: object }> = [];
  const api = {
    addGroup: vi.fn((group: { id: string }) => {
      dockviewGroups.push({ id: group.id });
    }),
    addPanel: vi.fn(),
    getGroup: vi.fn((id: string) =>
      dockviewGroups.find((group) => group.id === id)
    ),
    getPanel: vi.fn((id: string) =>
      dockviewPanels.find((panel) => panel.id === id)
    ),
    groups: dockviewGroups,
    onDidActivePanelChange: vi.fn(() => disposable),
    onDidAddGroup: vi.fn(() => disposable),
    onDidLayoutChange: vi.fn(() => disposable),
    onDidRemoveGroup: vi.fn(() => disposable),
    onDidRemovePanel: vi.fn(() => disposable),
    panels: dockviewPanels,
    removeGroup: vi.fn(),
    removePanel: vi.fn(),
  } as unknown as DockviewApi;

  return { api, dockviewPanels };
}

describe("useGridLayoutSync", () => {
  it("waits for Dockview to receive a newly registered renderer", () => {
    const { api, dockviewPanels } = createDockviewApi();

    function Harness() {
      const registeredRenderers = useRef(new Set<string>());
      const [componentRenderers, setComponentRenderers] = useState<
        Record<string, () => null>
      >({});
      const [panels, setPanels] = useState<Panel[]>([]);

      vi.mocked(api.addPanel).mockImplementation((panel) => {
        if (!registeredRenderers.current.has(panel.component)) {
          throw new Error("Dockview received an unknown renderer");
        }
        dockviewPanels.push({ id: panel.id, params: panel.params ?? {} });
        return undefined as never;
      });

      useGridLayoutSync({
        componentRenderers,
        dockviewRef: { current: api },
        getOrCreateRenderer: vi.fn(() => componentRenderers["test.content"]),
        groups: [],
        markPanelActive: vi.fn(),
        panels,
        removeGroup: vi.fn(),
        removePanel: vi.fn(),
      });

      useEffect(() => {
        setComponentRenderers({ "test.content": () => null });
        setPanels([trackedPanel]);
      }, []);

      return (
        <RendererRegistryEffect
          componentRenderers={componentRenderers}
          registeredRenderers={registeredRenderers}
        />
      );
    }

    render(<Harness />);

    expect(api.addPanel).toHaveBeenCalledOnce();
    expect(dockviewPanels).toHaveLength(1);
  });

  it("keeps a panel inserted before its state update commits", () => {
    const { api, dockviewPanels } = createDockviewApi();

    function InsertPanel({ onInsert }: { onInsert: () => void }) {
      useEffect(() => {
        dockviewPanels.push({ id: trackedPanel.id, params: {} });
        onInsert();
      }, [onInsert]);
      return null;
    }

    function Harness() {
      const [panels, setPanels] = useState<Panel[]>([]);
      const insertPanel = useCallback(() => setPanels([trackedPanel]), []);
      useGridLayoutSync({
        componentRenderers: {},
        dockviewRef: { current: api },
        getOrCreateRenderer: vi.fn(),
        groups: [],
        markPanelActive: vi.fn(),
        panels,
        removeGroup: vi.fn(),
        removePanel: vi.fn(),
      });

      return <InsertPanel onInsert={insertPanel} />;
    }

    render(<Harness />);

    expect(api.removePanel).not.toHaveBeenCalled();
  });

  it("waits for a referenced group before adding a deferred panel", () => {
    const { api, dockviewPanels } = createDockviewApi();
    const panel: Panel = {
      ...trackedPanel,
      position: { referenceGroup: MAIN_GROUP_ID },
    };
    const componentRenderers = { "test.content": () => null };

    function Harness({ groups }: { groups: Group[] }) {
      useGridLayoutSync({
        componentRenderers,
        dockviewRef: { current: api },
        getOrCreateRenderer: vi.fn(() => componentRenderers["test.content"]),
        groups,
        markPanelActive: vi.fn(),
        panels: [panel],
        removeGroup: vi.fn(),
        removePanel: vi.fn(),
      });
      return null;
    }

    vi.mocked(api.addPanel).mockImplementation((addedPanel) => {
      if (!api.getGroup(MAIN_GROUP_ID)) {
        throw new Error("dockview: referenceGroup 'main' does not exist");
      }
      dockviewPanels.push({
        id: addedPanel.id,
        params: addedPanel.params ?? {},
      });
      return undefined as never;
    });

    const view = render(<Harness groups={[]} />);

    expect(api.addPanel).not.toHaveBeenCalled();

    view.rerender(<Harness groups={[{ id: MAIN_GROUP_ID }]} />);

    expect(api.addGroup).toHaveBeenCalledOnce();
    expect(api.addPanel).toHaveBeenCalledOnce();
    expect(dockviewPanels).toHaveLength(1);
  });
});

function RendererRegistryEffect({
  componentRenderers,
  registeredRenderers,
}: {
  componentRenderers: Record<string, () => null>;
  registeredRenderers: React.RefObject<Set<string>>;
}) {
  useEffect(() => {
    registeredRenderers.current = new Set(Object.keys(componentRenderers));
  }, [componentRenderers, registeredRenderers]);
  return null;
}
