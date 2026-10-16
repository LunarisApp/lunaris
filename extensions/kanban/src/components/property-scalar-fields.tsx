import { Calendar } from "@lunarisapp/ui/components/calendar";
import { Input } from "@lunarisapp/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import { cn } from "@lunarisapp/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPropertyDate } from "../property-codec";
import type { PropertyValue } from "../types";
import {
  composerInputClassName,
  PropertyFieldButton,
  type PropertyFieldAppearance,
  metadataInputClassName,
  PropertyPlaceholder,
  PropertyTypeIcon,
} from "./property-field-shared";
import { PropertyPickerClearAction } from "./property-picker";

interface CommonFieldProps {
  appearance: PropertyFieldAppearance;
  className?: string;
  disabled: boolean;
  emptyLabel?: string;
  onValueChange: (value: PropertyValue | null) => void;
  propertyName: string;
}

export function DateField({
  appearance,
  className,
  disabled,
  emptyLabel,
  onValueChange,
  propertyName,
  value,
}: CommonFieldProps & { value: string | undefined }) {
  const { i18n, t } = useTranslation();
  const selected = value ? dateForPicker(value) : undefined;
  const time = value?.includes("T") ? localTime(new Date(value)) : "";
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <PropertyFieldButton
            appearance={appearance}
            aria-label={propertyName}
            className={cn("h-7 min-w-28 justify-start", className)}
          />
        }
      >
        {appearance === "composer" ? <PropertyTypeIcon type="date" /> : null}
        {value ? (
          <span className="truncate">
            {formatPropertyDate(value, i18n.language)}
          </span>
        ) : (
          <PropertyPlaceholder>
            {emptyLabel ??
              t("extensions.catalog.lunaris.kanban.propertyPlaceholders.date")}
          </PropertyPlaceholder>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <Calendar
          mode="single"
          onSelect={(date) => {
            if (!date) {
              return;
            }
            onValueChange(time ? withLocalTime(date, time) : localDate(date));
          }}
          selected={selected}
        />
        <div className="flex items-center gap-2 border-t pt-2">
          <Input
            aria-label={t("extensions.catalog.lunaris.kanban.time")}
            className="h-7"
            disabled={!selected}
            onChange={(event) => {
              if (!selected) {
                return;
              }
              onValueChange(
                event.target.value
                  ? withLocalTime(selected, event.target.value)
                  : localDate(selected)
              );
            }}
            type="time"
            value={time}
          />
          <PropertyPickerClearAction onClear={() => onValueChange(null)}>
            {t("extensions.catalog.lunaris.kanban.clear")}
          </PropertyPickerClearAction>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DraftField({
  appearance,
  className,
  disabled,
  emptyLabel,
  number = false,
  onValueChange,
  propertyName,
  value,
}: CommonFieldProps & { number?: boolean; value: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const skipNextCommit = useRef(false);
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = () => {
    if (skipNextCommit.current) {
      skipNextCommit.current = false;
      return;
    }
    if (!draft.trim()) {
      setInvalid(false);
      onValueChange(null);
      return;
    }
    if (number) {
      const parsed = Number(draft);
      if (Number.isFinite(parsed)) {
        setInvalid(false);
        onValueChange(parsed);
      } else {
        setInvalid(true);
      }
      return;
    }
    setInvalid(false);
    onValueChange(draft);
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="relative inline-flex min-w-0">
        {appearance === "composer" ? (
          <span className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2">
            <PropertyTypeIcon type={number ? "number" : "text"} />
          </span>
        ) : null}
        <Input
          aria-invalid={invalid}
          aria-label={propertyName}
          className={cn(
            "h-7 min-w-28 max-w-64",
            appearance === "composer" && composerInputClassName,
            appearance === "composer" && "pl-8!",
            appearance === "metadata" && metadataInputClassName,
            className
          )}
          disabled={disabled}
          inputMode={number ? "decimal" : undefined}
          onBlur={commit}
          onChange={(event) => {
            setDraft(event.target.value);
            if (invalid) {
              setInvalid(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              skipNextCommit.current = true;
              setDraft(value);
              setInvalid(false);
              event.currentTarget.blur();
            }
          }}
          placeholder={
            emptyLabel ??
            t(
              `extensions.catalog.lunaris.kanban.propertyPlaceholders.${number ? "number" : "text"}`
            )
          }
          step={number ? "any" : undefined}
          type={number ? "number" : "text"}
          value={draft}
        />
      </span>
      {invalid ? (
        <span className="text-destructive text-xs" role="alert">
          {t("extensions.catalog.lunaris.kanban.validation.finiteNumber")}
        </span>
      ) : null}
    </span>
  );
}

function dateForPicker(value: string): Date {
  if (value.includes("T")) {
    return new Date(value);
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function withLocalTime(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const local = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes
  );
  return local.toISOString();
}
