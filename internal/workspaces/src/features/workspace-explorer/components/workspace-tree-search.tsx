"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { Cancel01Icon, HugeiconsIcon, SearchIcon } from "@lunarisapp/ui/icons";
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
      className={cn(
        "flex-1 min-w-0 border-input/40 bg-transparent dark:bg-transparent hover:border-input",
        isMobile ? "h-10" : "h-7",
        className,
      )}
    >
      <InputGroupAddon align="inline-start" className="text-muted-foreground">
        <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
      </InputGroupAddon>
      <InputGroupInput
        aria-autocomplete="list"
        aria-controls={controlsId}
        aria-expanded={value.length > 0}
        aria-haspopup="listbox"
        aria-label={t("explorer.searchPlaceholder")}
        className="[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        onKeyDown={onKeyDown}
        placeholder={t("explorer.searchPlaceholder")}
        role="combobox"
        type="search"
        value={value}
        {...(activeDescendantId
          ? { "aria-activedescendant": activeDescendantId }
          : {})}
      />
      {value.length > 0 && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={t("explorer.clearSearch")}
            onClick={() => onChange("")}
            size={isMobile ? "icon-sm" : "icon-xs"}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
