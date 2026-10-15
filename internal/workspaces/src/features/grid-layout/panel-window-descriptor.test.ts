/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import {
  decodePanelWindowDescriptor,
  encodePanelWindowDescriptor,
  jsonObjectsEqual,
  PANEL_WINDOW_DESCRIPTOR_LIMIT,
  type PanelWindowDescriptor,
  panelWindowDescriptorFromPanel,
  panelWindowDescriptorSchema,
} from "./panel-window-descriptor";
import { GRID_LAYOUT_UNLOADED_PARAM, type Panel } from "./types";

const descriptor: PanelWindowDescriptor = {
  extensionId: "lunaris.rich-text",
  params: {
    resourceId: "item-1",
    nested: { b: "β", a: "å" },
    values: [1, true, null],
  },
  title: "Résumé 📝",
  viewId: "content",
};

describe("panel window descriptors", () => {
  it("round-trips Unicode descriptors as base64url", () => {
    const encoded = encodePanelWindowDescriptor(descriptor);

    expect(encoded).toMatch(/^[\w-]+$/u);
    expect(decodePanelWindowDescriptor(encoded)).toEqual(descriptor);
  });

  it("rejects invalid descriptor values", () => {
    expect(() =>
      panelWindowDescriptorSchema.parse({
        extensionId: "plugin",
        params: { invalid: Number.NaN },
        title: "Invalid",
        viewId: "content",
      })
    ).toThrow();
  });

  it("rejects descriptors over 16 KiB when encoding", () => {
    expect(() =>
      encodePanelWindowDescriptor({
        ...descriptor,
        title: "x".repeat(PANEL_WINDOW_DESCRIPTOR_LIMIT),
      })
    ).toThrow("Panel window descriptor exceeds 16 KiB");
  });

  it("rejects decoded payloads over 16 KiB before parsing", () => {
    const oversized = btoa(
      "x".repeat(PANEL_WINDOW_DESCRIPTOR_LIMIT + 1)
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");

    expect(() => decodePanelWindowDescriptor(oversized)).toThrow(
      "Panel window descriptor exceeds 16 KiB"
    );
  });

  it("strips internal unload state when creating a descriptor", () => {
    const panel: Panel = {
      id: "panel-1",
      isUnloaded: true,
      lastActiveAt: 1,
      params: {
        resourceId: "item-1",
        [GRID_LAYOUT_UNLOADED_PARAM]: true,
      },
      pluginId: "plugin",
      renderer: "content",
      title: "Document",
    };

    expect(panelWindowDescriptorFromPanel(panel)).toEqual({
      extensionId: "plugin",
      params: { resourceId: "item-1" },
      title: "Document",
      viewId: "content",
    });
  });
});

describe("jsonObjectsEqual", () => {
  it("ignores object key order recursively and internal unload state", () => {
    expect(
      jsonObjectsEqual(
        {
          [GRID_LAYOUT_UNLOADED_PARAM]: true,
          nested: { a: 1, b: { c: 2, d: 3 } },
        },
        {
          nested: { b: { d: 3, c: 2 }, a: 1 },
          [GRID_LAYOUT_UNLOADED_PARAM]: false,
        }
      )
    ).toBe(true);
  });

  it("preserves array ordering", () => {
    expect(jsonObjectsEqual({ values: [1, 2] }, { values: [2, 1] })).toBe(
      false
    );
  });
});
