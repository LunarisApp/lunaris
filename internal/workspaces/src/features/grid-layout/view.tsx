import { cn } from "@lunarisapp/ui/lib/utils";
import type {
  DockviewApi,
  DockviewDidDropEvent,
  DockviewReadyEvent,
} from "dockview";
import { DockviewReact } from "dockview-react";
import { useEffect, useRef } from "react";
import { useOrganizationNavigation } from "../organization-navigation";
import { GridLayoutEmptyPanel } from "./components/empty-panel";
import { GridLayoutGroupControls } from "./components/group-controls";
import { GridLayoutTab } from "./components/tab";
import { useGridLayoutStore } from "./context";
import { readResourceDragPayload } from "./dnd";
import { EMPTY_PANEL_PLUGIN_ID, EMPTY_PANEL_RENDERER } from "./empty-panel";
import { useCloseActivePanel } from "./hooks/use-close-active-panel";
import { useGridLayoutSync } from "./hooks/use-grid-layout-sync";
import { useMoveActivePanelToWindow } from "./hooks/use-move-active-panel-to-window";
import { useNewTabHotkey } from "./hooks/use-new-tab-hotkey";
import { getRendererComponent } from "./types";
import {
  hasLunarisResourceMime,
  isDragEvent,
  mapDidDropToTarget,
} from "./view-utils";

import "dockview-react/dist/styles/dockview.css";
import "./focus-mode.css";
import "./styles.css";

export function GridLayoutView({ className }: { className?: string }) {
  const panels = useGridLayoutStore((state) => state.panels);
  const groups = useGridLayoutStore((state) => state.groups);
  const componentRenderers = useGridLayoutStore(
    (state) => state.componentRenderers
  );
  const getOrCreateRenderer = useGridLayoutStore(
    (state) => state.getOrCreateRenderer
  );
  const removePanel = useGridLayoutStore((state) => state.removePanel);
  const removeGroup = useGridLayoutStore((state) => state.removeGroup);
  const register = useGridLayoutStore((state) => state.register);
  const setDockviewApi = useGridLayoutStore((state) => state.setDockviewApi);
  const markPanelActive = useGridLayoutStore((state) => state.markPanelActive);
  const isFocusMode = useGridLayoutStore((state) => state.isFocusMode);
  const { openResource } = useOrganizationNavigation();
  const dockviewRef = useRef<DockviewApi | null>(null);
  const dockviewRootRef = useRef<HTMLDivElement | null>(null);
  const emptyPanelComponent = getRendererComponent(
    EMPTY_PANEL_PLUGIN_ID,
    EMPTY_PANEL_RENDERER
  );
  const emptyPanelReady = Boolean(componentRenderers[emptyPanelComponent]);

  useEffect(() => {
    if (emptyPanelReady) {
      return;
    }
    register(EMPTY_PANEL_PLUGIN_ID, EMPTY_PANEL_RENDERER, (props) => (
      <GridLayoutEmptyPanel {...props} />
    ));
  }, [emptyPanelReady, register]);

  useCloseActivePanel(dockviewRootRef);
  useMoveActivePanelToWindow(dockviewRootRef);
  useNewTabHotkey();

  // Sync state <-> dockview
  useGridLayoutSync({
    dockviewRef,
    panels,
    groups,
    componentRenderers,
    getOrCreateRenderer,
    markPanelActive,
    removePanel,
    removeGroup,
  });

  useEffect(
    () => () => {
      dockviewRef.current = null;
      setDockviewApi(null);
    },
    [setDockviewApi]
  );

  // Store dockview API reference - useGridLayoutSync handles the actual sync
  const onReady = (event: DockviewReadyEvent) => {
    dockviewRef.current = event.api;
    setDockviewApi(event.api);
    if (event.api.activePanel) {
      markPanelActive(event.api.activePanel.id);
    }
    // Accept our foreign drag payloads so dockview renders the drop overlay.
    event.api.onUnhandledDragOver((dndEvent) => {
      if (
        isDragEvent(dndEvent.nativeEvent) &&
        hasLunarisResourceMime(dndEvent.nativeEvent)
      ) {
        dndEvent.accept();
      }
    });
  };

  const onDidDrop = (event: DockviewDidDropEvent) => {
    if (!isDragEvent(event.nativeEvent)) {
      return;
    }
    const payload = readResourceDragPayload(event.nativeEvent);
    if (!payload) {
      return;
    }
    const target = mapDidDropToTarget(event);
    for (const entry of payload.resources) {
      openResource({
        resourceId: entry.resourceId,
        resourceTypeId: entry.resourceTypeId,
        schemaVersion: entry.schemaVersion,
        title: entry.title,
        target,
      });
    }
  };

  return (
    <div
      className={cn("h-full w-full", className)}
      ref={dockviewRootRef}
      tabIndex={-1}
    >
      <DockviewReact
        className="h-full w-full"
        components={componentRenderers}
        defaultTabComponent={GridLayoutTab}
        leftHeaderActionsComponent={
          emptyPanelReady ? GridLayoutGroupControls : undefined
        }
        onDidDrop={onDidDrop}
        onReady={onReady}
        theme={{
          name: "lunaris",
          className: cn("grid-layout-theme", isFocusMode && "focus-mode"),
          gap: isFocusMode ? 0 : 10,
        }}
      />
    </div>
  );
}
