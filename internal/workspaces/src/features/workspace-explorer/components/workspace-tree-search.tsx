"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupClearButton,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
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

  return (
    <InputGroup className={cn("h-7 flex-1", className)}>
      <InputGroupAddon align="inline-start">
        <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
      </InputGroupAddon>
      <InputGroupInput
        aria-autocomplete="list"
        aria-controls={controlsId}
        aria-expanded={value.length > 0}
        aria-haspopup="listbox"
        aria-label={t("explorer.searchPlaceholder")}
        className="h-auto self-stretch"
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
          onClear={() => onChange("")}
        />
      )}
    </InputGroup>
  );
}
