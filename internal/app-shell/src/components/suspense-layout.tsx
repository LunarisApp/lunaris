import { useSettingsHotkey } from "@repo/features/settings/use-settings-hotkey";
import { Suspense } from "react";
import { Outlet } from "react-router";

export default function SuspenseLayout() {
  useSettingsHotkey();

  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
