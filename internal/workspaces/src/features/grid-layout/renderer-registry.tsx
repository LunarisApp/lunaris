import type { IDockviewPanelProps } from "dockview";
import { createElement, type ReactNode, useSyncExternalStore } from "react";
import { ExtensionPlaceholder } from "../extensions/ExtensionPlaceholder";
import { GridLayoutPanel } from "./panel";
import { GRID_LAYOUT_UNLOADED_PARAM } from "./types";

export type GridLayoutRenderer = (props: IDockviewPanelProps) => ReactNode;

export type GridLayoutRenderers = Record<string, GridLayoutRenderer>;

export interface GridLayoutRendererSlot {
  Renderer: GridLayoutRenderer;
  setRenderer: (renderer: GridLayoutRenderer | undefined) => void;
}

/** Keeps Dockview's mounted component stable while its implementation changes. */
export function createRendererSlot(): GridLayoutRendererSlot {
  const listeners = new Set<() => void>();
  let currentRenderer: GridLayoutRenderer | undefined;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  function RendererSlot(props: IDockviewPanelProps) {
    const renderer = useSyncExternalStore(
      subscribe,
      () => currentRenderer,
      () => currentRenderer
    );
    return renderer ? createElement(renderer, props) : null;
  }

  return {
    Renderer: RendererSlot,
    setRenderer: (renderer) => {
      if (currentRenderer === renderer) {
        return;
      }
      currentRenderer = renderer;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export function createPlaceholderRenderer(
  pluginId: string
): GridLayoutRenderer {
  return function PlaceholderRenderer() {
    return (
      <GridLayoutPanel>
        <ExtensionPlaceholder extensionId={pluginId} />
      </GridLayoutPanel>
    );
  };
}

export function createRegisteredRenderer(
  builder: GridLayoutRenderer
): GridLayoutRenderer {
  return function RegisteredRenderer(props: IDockviewPanelProps) {
    const { [GRID_LAYOUT_UNLOADED_PARAM]: isUnloaded, ...rendererParams } =
      props.params ?? {};

    if (isUnloaded === true) {
      return <GridLayoutPanel />;
    }

    return (
      <GridLayoutPanel>
        {createElement(builder, { ...props, params: rendererParams })}
      </GridLayoutPanel>
    );
  };
}

export function setRendererEntry(
  renderers: GridLayoutRenderers,
  component: string,
  renderer: GridLayoutRenderer
): GridLayoutRenderers {
  return {
    ...renderers,
    [component]: renderer,
  };
}

export function removeRendererEntry(
  renderers: GridLayoutRenderers,
  component: string
): GridLayoutRenderers {
  const { [component]: _removed, ...rest } = renderers;
  return rest;
}

export function getPluginRendererKeys(
  renderers: GridLayoutRenderers,
  pluginId: string
): string[] {
  const prefix = `${pluginId}.`;
  return Object.keys(renderers).filter((key) => key.startsWith(prefix));
}

export function removePluginRendererEntries(
  renderers: GridLayoutRenderers,
  pluginId: string
): GridLayoutRenderers {
  const nextRenderers = { ...renderers };

  for (const key of getPluginRendererKeys(renderers, pluginId)) {
    delete nextRenderers[key];
  }

  return nextRenderers;
}
