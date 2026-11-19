"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupClearButton,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { HugeiconsIcon, SearchIcon } from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

interface WorkspaceTreeSearchProps {
  activeDescendantId?: string;
  className?: string;
  controlsId?: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  value: string;
}

export function WorkspaceTreeSearch({
  value,
  onChange,
  onKeyDown,
  className,
  controlsId,
  activeDescendantId,
}: WorkspaceTreeSearchProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  return (
    <InputGroup
      className={cn("flex-1", isMobile ? "touch-target" : "h-7", className)}
    >
      <InputGroupAddon align="inline-start">
        <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
      </InputGroupAddon>
      <InputGroupInput
        aria-autocomplete="list"
        aria-controls={controlsId}
        aria-expanded={value.length > 0}
        aria-haspopup="listbox"
        aria-label={t("explorer.searchPlaceholder")}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        onKeyDown={onKeyDown}
        placeholder={t("common.search")}
        role="combobox"
        type="search"
        value={value}
        {...(activeDescendantId
          ? { "aria-activedescendant": activeDescendantId }
          : {})}
      />
      {value.length > 0 && (
        <InputGroupClearButton
          aria-label={t("explorer.clearSearch")}
          className={isMobile ? "touch-target" : undefined}
          onClear={() => onChange("")}
          size={isMobile ? "icon-sm" : "icon-xs"}
        />
      )}
    </InputGroup>
  );
}
