import { act, render, screen } from "@testing-library/react";
import type { IDockviewPanelProps } from "dockview";
import { describe, expect, it, vi } from "vitest";
import {
  createRegisteredRenderer,
  createRendererSlot,
} from "./renderer-registry";
import { GRID_LAYOUT_UNLOADED_PARAM } from "./types";

describe("createRegisteredRenderer", () => {
  it("renders the registered builder when the panel is loaded", () => {
    const builder = vi.fn((_props: IDockviewPanelProps) => (
      <div>Loaded panel</div>
    ));
    const Renderer = createRegisteredRenderer(builder);

    render(
      Renderer({
        params: { [GRID_LAYOUT_UNLOADED_PARAM]: false, viewId: "doc-1" },
      } as never)
    );

    expect(builder).toHaveBeenCalledOnce();
    expect(builder.mock.calls[0]?.[0]?.params).toEqual({ viewId: "doc-1" });
    expect(screen.getByText("Loaded panel")).toBeDefined();
  });

  it("skips the registered builder when the panel is unloaded", () => {
    const builder = vi.fn(() => <div>Loaded panel</div>);
    const Renderer = createRegisteredRenderer(builder);

    render(
      Renderer({
        params: { [GRID_LAYOUT_UNLOADED_PARAM]: true },
      } as never)
    );

    expect(builder).not.toHaveBeenCalled();
    expect(screen.queryByText("Loaded panel")).toBeNull();
  });
});

describe("createRendererSlot", () => {
  it("replaces a mounted implementation without recreating its Dockview panel", () => {
    const slot = createRendererSlot();
    const Renderer = slot.Renderer;
    slot.setRenderer(() => <div>Loading extension</div>);

    render(<Renderer {...({} as IDockviewPanelProps)} />);

    expect(screen.getByText("Loading extension")).toBeDefined();

    act(() => slot.setRenderer(() => <div>Loaded extension</div>));

    expect(screen.queryByText("Loading extension")).toBeNull();
    expect(screen.getByText("Loaded extension")).toBeDefined();
  });
});
