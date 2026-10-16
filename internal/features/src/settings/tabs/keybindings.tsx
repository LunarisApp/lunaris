"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@lunarisapp/ui/components/alert-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import { Button } from "@lunarisapp/ui/components/button";
import { Alert02Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { usePlatform } from "@repo/platform";
import posthog from "posthog-js";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HOTKEYS,
  type HotkeyCategory,
  type HotkeyDefinition,
  KeybindingRow,
  useHotkeyOverrides,
} from "../../hotkeys";

const CATEGORY_ORDER: HotkeyCategory[] = [
  "general",
  "navigation",
  "workspaces",
];

export function KeybindingsContent() {
  const { t } = useTranslation();
  const { kind: platformKind } = usePlatform();
  const overrides = useHotkeyOverrides((s) => s.overrides);
  const resetAll = useHotkeyOverrides((s) => s.resetAll);
  const hasOverrides = Object.keys(overrides).length > 0;
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups = new Map<HotkeyCategory, HotkeyDefinition[]>();
    for (const def of Object.values(HOTKEYS)) {
      const list = groups.get(def.category) ?? [];
      list.push(def);
      groups.set(def.category, list);
    }
    return groups;
  }, []);

  const handleResetAll = () => {
    resetAll();
    posthog.capture("keybindings_reset_all");
    setResetConfirmOpen(false);
  };

  return (
    <div className="space-y-10" data-testid="settings-panel-keybindings">
      <div className="space-y-4">
        <div className="flex justify-end pb-1">
          <AlertDialog
            onOpenChange={setResetConfirmOpen}
            open={resetConfirmOpen}
          >
            <AlertDialogTrigger
              disabled={!hasOverrides}
              render={
                <Button
                  className="w-full shrink-0 sm:w-auto"
                  data-testid="keybindings-reset-all"
                  disabled={!hasOverrides}
                  size="sm"
                  variant="outline"
                />
              }
            >
              {t("settings.keybindings.resetAll")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("settings.keybindings.resetConfirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("settings.keybindings.resetConfirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="keybindings-reset-all-confirm"
                  onClick={handleResetAll}
                >
                  {t("settings.keybindings.resetAll")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {platformKind === "web" ? (
          <Alert role="note" variant="warning">
            <HugeiconsIcon aria-hidden="true" icon={Alert02Icon} />
            <AlertTitle>
              {t("settings.keybindings.browserConflictTitle")}
            </AlertTitle>
            <AlertDescription>
              {t("settings.keybindings.browserConflictDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = grouped.get(category);
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <section
            aria-labelledby={`keybindings-${category}-heading`}
            className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8"
            key={category}
          >
            <h2
              className="font-medium text-sm"
              id={`keybindings-${category}-heading`}
            >
              {t(`settings.keybindings.categories.${category}`)}
            </h2>
            <div className="divide-y">
              {items.map((hotkey) => (
                <KeybindingRow hotkey={hotkey} key={hotkey.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
