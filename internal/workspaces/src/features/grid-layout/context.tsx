import { usePlatform } from "@repo/platform";
import { createContext, type ReactNode, useContext, useRef } from "react";
import { useStore } from "zustand";
import {
  createGridLayoutStore,
  type GridLayoutState,
  type GridLayoutStore,
  type MovePanelToWindow,
} from "./store";

export type {
  GridLayoutState,
  MovePanelToWindow,
  OpenResourcePanelInput,
  OpenPluginPanelInput,
  OpenRightDockPanelInput,
  OpenToolPanelInput,
} from "./store";
export {
  FOCUS_MODE_WIDTH_MIN,
  GRID_LAYOUT_LOADED_PANEL_LIMIT,
} from "./store";

const GridLayoutContext = createContext<GridLayoutStore | null>(null);

export function GridLayoutProvider({
  children,
  onMovePanelToWindow,
}: {
  children: ReactNode;
  onMovePanelToWindow?: MovePanelToWindow;
}) {
  const { viewport } = usePlatform();
  const onMovePanelToWindowRef = useRef(onMovePanelToWindow);
  onMovePanelToWindowRef.current = onMovePanelToWindow;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const storeRef = useRef<GridLayoutStore | null>(null);
  storeRef.current ??= createGridLayoutStore(
    () => onMovePanelToWindowRef.current,
    () => viewportRef.current.width()
  );

  return (
    <GridLayoutContext.Provider value={storeRef.current}>
      {children}
    </GridLayoutContext.Provider>
  );
}

export function useGridLayoutStore<T>(
  selector: (state: GridLayoutState) => T
): T {
  const store = useContext(GridLayoutContext);
  if (!store) {
    throw new Error(
      "useGridLayoutStore must be used within a GridLayoutProvider"
    );
  }

  return useStore(store, selector);
}

export function useGridLayoutStoreState() {
  const store = useContext(GridLayoutContext);
  if (!store) {
    throw new Error(
      "useGridLayoutStore must be used within a GridLayoutProvider"
    );
  }

  return useStore(store);
}
