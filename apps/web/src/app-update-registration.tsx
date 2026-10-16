import type { AppUpdateState } from "@repo/app-shell";
import { useCallback, useEffect, useRef } from "react";
import { useWebAppUpdate } from "./app-update";

export default function WebAppUpdateRegistration({
  onChange,
}: {
  onChange: (state: AppUpdateState) => void;
}) {
  const appUpdate = useWebAppUpdate({ immediate: true });
  const updateRef = useRef(appUpdate.update);
  updateRef.current = appUpdate.update;
  const update = useCallback(() => updateRef.current(), []);

  useEffect(
    () => onChange({ needRefresh: appUpdate.needRefresh, update }),
    [appUpdate.needRefresh, onChange, update]
  );
  return null;
}
