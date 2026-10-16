"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import { HugeiconsIcon } from "@lunarisapp/ui/icons";
import type { Hotkey } from "@tanstack/react-hotkeys";
import { useHotkeyRecorder } from "@tanstack/react-hotkeys";
import posthog from "posthog-js";
import { useTranslation } from "react-i18next";
import { formatHotkeyDisplay } from "./display";
import { getHotkeyBinding, getHotkeyPlatform } from "./helpers";
import { isValidHotkeyBinding, useHotkeyOverrides } from "./overrides";
import { HOTKEYS, type HotkeyDefinition, type HotkeyId } from "./registry";
import { useResolvedHotkeyBinding } from "./use-resolved-hotkey";

function findConflict(
  id: HotkeyId,
  binding: Hotkey,
  overrides: Partial<Record<HotkeyId, Hotkey>>
): HotkeyId | null {
  const platform = getHotkeyPlatform();
  for (const otherId of Object.keys(HOTKEYS) as HotkeyId[]) {
    if (otherId === id) {
      continue;
    }
    const otherBinding = getHotkeyBinding(
      HOTKEYS[otherId],
      platform,
      overrides
    );
    if (otherBinding === binding) {
      return otherId;
    }
  }
  return null;
}

export interface KeybindingRowProps {
  hotkey: HotkeyDefinition;
}

export function KeybindingRow({ hotkey }: KeybindingRowProps) {
  const { t } = useTranslation();
  const overrides = useHotkeyOverrides((s) => s.overrides);
  const setOverride = useHotkeyOverrides((s) => s.setOverride);
  const clearOverride = useHotkeyOverrides((s) => s.clearOverride);

  const currentBinding = useResolvedHotkeyBinding(hotkey);
  const defaultBinding = getHotkeyBinding(hotkey, getHotkeyPlatform(), {});
  const isCustom = overrides[hotkey.id] !== undefined;

  const recorder = useHotkeyRecorder({
    onRecord: (recorded) => {
      // Reject empty / modifier-only captures so the user can't silently
      // brick a hotkey. Keep recorder open so they can try again.
      if (!isValidHotkeyBinding(recorded)) {
        return;
      }
      const prev = currentBinding;
      setOverride(hotkey.id, recorded);
      posthog.capture("keybinding_rebound", {
        hotkey_id: hotkey.id,
        from: prev,
        to: recorded,
      });
      recorder.stopRecording();
    },
  });

  const handleReset = () => {
    clearOverride(hotkey.id);
    posthog.capture("keybinding_reset", { hotkey_id: hotkey.id });
  };

  const conflict = isCustom
    ? findConflict(hotkey.id, currentBinding, overrides)
    : null;

  const displayed =
    recorder.isRecording && recorder.recordedHotkey
      ? formatHotkeyDisplay(recorder.recordedHotkey)
      : formatHotkeyDisplay(currentBinding);

  return (
    <div
      className="grid gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      data-testid={`keybinding-row-${hotkey.id}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {hotkey.icon ? (
          <HugeiconsIcon
            className="size-4 shrink-0 text-muted-foreground"
            icon={hotkey.icon}
            strokeWidth={2}
          />
        ) : null}
        <div className="min-w-0">
          <span className="block truncate font-medium text-sm">
            {t(hotkey.nameKey)}
          </span>
          {isCustom && !recorder.isRecording ? (
            <span className="block truncate text-muted-foreground text-xs">
              {t("settings.keybindings.defaultHint", {
                default: formatHotkeyDisplay(defaultBinding),
              })}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 sm:justify-end">
        <Kbd
          className="mr-auto min-w-12 px-2 sm:mr-2"
          data-recording={recorder.isRecording || undefined}
          data-testid={`keybinding-badge-${hotkey.id}`}
        >
          {/* biome-ignore lint/suspicious/noLeakedRender: Both ternary branches intentionally render valid ReactNode/text values. */}
          {recorder.isRecording
            ? recorder.recordedHotkey
              ? displayed
              : t("settings.keybindings.recording")
            : displayed}
        </Kbd>
        {recorder.isRecording ? (
          <Button
            data-testid={`keybinding-cancel-${hotkey.id}`}
            onClick={() => recorder.cancelRecording()}
            size="sm"
            variant="ghost"
          >
            {t("common.cancel")}
          </Button>
        ) : (
          <Button
            data-testid={`keybinding-edit-${hotkey.id}`}
            onClick={() => recorder.startRecording()}
            size="sm"
            variant="ghost"
          >
            {t("settings.keybindings.edit")}
          </Button>
        )}
        <Button
          data-testid={`keybinding-reset-${hotkey.id}`}
          disabled={!isCustom || recorder.isRecording}
          onClick={handleReset}
          size="sm"
          variant="ghost"
        >
          {t("settings.keybindings.reset")}
        </Button>
      </div>
      {recorder.isRecording ? (
        <p className="pl-6 text-muted-foreground text-xs sm:col-span-2">
          {t("settings.keybindings.cancelHint")}
        </p>
      ) : null}
      {!recorder.isRecording && conflict ? (
        <p className="pl-6 text-destructive text-xs sm:col-span-2">
          {t("settings.keybindings.conflict", {
            other: t(HOTKEYS[conflict].nameKey),
          })}
        </p>
      ) : null}
    </div>
  );
}
