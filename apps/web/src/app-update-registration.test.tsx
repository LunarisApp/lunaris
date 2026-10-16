/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebAppUpdateRegistration from "./app-update-registration";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  appUpdate: {
    needRefresh: false,
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./app-update", () => ({
  useWebAppUpdate: () => mocks.appUpdate,
}));

beforeEach(() => {
  mocks.appUpdate = {
    needRefresh: false,
    update: vi.fn().mockResolvedValue(undefined),
  };
});

describe("WebAppUpdateRegistration", () => {
  it("publishes only semantic state changes while retaining the latest action", async () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<WebAppUpdateRegistration onChange={onChange} />));
    const firstUpdate = onChange.mock.calls[0]?.[0]
      .update as () => Promise<void>;
    const latestUpdate = vi.fn().mockResolvedValue(undefined);

    mocks.appUpdate = { needRefresh: false, update: latestUpdate };
    act(() => root.render(<WebAppUpdateRegistration onChange={onChange} />));

    expect(onChange).toHaveBeenCalledOnce();
    await act(async () => firstUpdate());
    expect(latestUpdate).toHaveBeenCalledOnce();

    mocks.appUpdate = { needRefresh: true, update: latestUpdate };
    act(() => root.render(<WebAppUpdateRegistration onChange={onChange} />));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0].needRefresh).toBe(true);
    act(() => root.unmount());
  });
});
