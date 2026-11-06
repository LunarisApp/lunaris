"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import { HugeiconsIcon, Search01Icon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";
import { useHotkeyDisplay } from "@repo/features/hotkeys";
import { useSearchDialog } from "../hooks/useSearchDialog";

/**
 * Search button for the app bar - shows the search label and shortcut hint.
 * Clicking opens the search dialog via SearchProvider context.
 */
export function SearchButton({
  className,
  "data-testid": testId,
}: {
  className?: string;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  const { open } = useSearchDialog();

  const shortcutHint = useHotkeyDisplay("toggle-search");

  return (
    <Button
      aria-label={t("common.search")}
      className={className ?? "w-[15.6rem] max-w-full"}
      data-testid={testId}
      aria-haspopup="dialog"
      onClick={open}
      variant="outline"
    >
      <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
      <span className="min-w-0 truncate">{t("common.search")}</span>
      <Kbd className="ml-auto hidden sm:inline-flex">{shortcutHint}</Kbd>
    </Button>
  );
}
