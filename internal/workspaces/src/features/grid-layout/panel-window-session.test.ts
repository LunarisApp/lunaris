/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it } from "vitest";
import type { PanelWindowDescriptor } from "./panel-window-descriptor";
import {
  buildPanelWindowPath,
  completePanelWindowTransfer,
  panelWindowSearch,
  persistPanelWindowDescriptor,
  readPanelWindowSession,
} from "./panel-window-session";

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

describe("panel window sessions", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("parses launch query and restores it from session storage", () => {
    const path = buildPanelWindowPath({
      descriptor,
      path: "/organization/workspace",
      sourceWindowId: "main",
      token: "secret",
      transferId: "transfer-1",
      windowId: "panel-1",
    });
    const launchSession = readPanelWindowSession(
      new URL(path, location.origin).search
    );

    expect(launchSession).toEqual({
      descriptor,
      transfer: {
        sourceWindowId: "main",
        token: "secret",
        transferId: "transfer-1",
      },
      windowId: "panel-1",
    });
    expect(readPanelWindowSession(panelWindowSearch("panel-1"))).toEqual(
      launchSession
    );
  });

  it("persists descriptor updates and completed transfers", () => {
    const session = {
      descriptor,
      transfer: {
        sourceWindowId: "main",
        token: "secret",
        transferId: "transfer-1",
      },
      windowId: "panel-1",
    };
    const updatedDescriptor = { ...descriptor, title: "Updated" };

    persistPanelWindowDescriptor(session, updatedDescriptor);
    expect(readPanelWindowSession(panelWindowSearch("panel-1"))).toEqual({
      ...session,
      descriptor: updatedDescriptor,
    });

    completePanelWindowTransfer({ ...session, descriptor: updatedDescriptor });
    expect(readPanelWindowSession(panelWindowSearch("panel-1"))).toEqual({
      descriptor: updatedDescriptor,
      windowId: "panel-1",
    });
  });

  it("returns safe empty state for invalid launch payloads", () => {
    expect(
      readPanelWindowSession(
        "?panelWindow=panel-1&panelDescriptor=invalid&panelTransfer=transfer-1&panelToken=secret"
      )
    ).toEqual({ descriptor: null, windowId: "panel-1" });
    expect(readPanelWindowSession("?unrelated=true")).toBeNull();
  });
});
