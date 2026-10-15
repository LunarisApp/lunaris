import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { useSettingsHotkey } = vi.hoisted(() => ({
  useSettingsHotkey: vi.fn(),
}));

vi.mock("@repo/features/settings/use-settings-hotkey", () => ({
  useSettingsHotkey,
}));

vi.mock("react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

import SuspenseLayout from "./suspense-layout";

it("registers the app settings hotkey", () => {
  render(<SuspenseLayout />);

  expect(useSettingsHotkey).toHaveBeenCalledOnce();
});
