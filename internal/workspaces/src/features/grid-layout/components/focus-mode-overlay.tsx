import { cn } from "@lunarisapp/ui/lib/utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGridLayoutStore } from "../context";

export function FocusModeOverlay() {
  const isFocusMode = useGridLayoutStore((s) => s.isFocusMode);
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isFocusMode) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [isFocusMode]);

  if (!isFocusMode) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed top-6 left-1/2 z-50 -translate-x-1/2",
        "rounded-full bg-popover px-4 py-2 text-popover-foreground text-sm shadow-lg",
        "transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {t("focusMode.exitHint")}
    </div>
  );
}
