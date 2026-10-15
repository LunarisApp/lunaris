import { Popover, PopoverContent, PopoverTrigger } from "@lunarisapp/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@lunarisapp/ui/components/select";
import { cn } from "@lunarisapp/ui/lib/utils";
import { useTranslation } from "react-i18next";
import type { ChoicePropertyDefinition, PropertyValue } from "../types";
import {
  composerSelectTriggerClassName,
  PropertyFieldButton,
  type PropertyFieldAppearance,
  metadataSelectTriggerClassName,
  PropertyPlaceholder,
  PropertyTypeIcon,
} from "./property-field-shared";
import {
  PropertyPickerClearAction,
  propertyPickerContentClassName,
  PropertyPickerList,
  PropertyPickerOption,
  propertyPickerOptionClassName,
} from "./property-picker";
import { PropertyTag } from "./property-tag";

const CLEAR_VALUE = "__clear_property_value__";

interface ChoicePropertyFieldProps {
  appearance: PropertyFieldAppearance;
  className?: string;
  disabled: boolean;
  emptyLabel?: string;
  onValueChange: (value: PropertyValue | null) => void;
  property: ChoicePropertyDefinition;
}

export function SelectPropertyField({
  appearance,
  className,
  disabled,
  emptyLabel,
  onValueChange,
  property,
  value,
}: ChoicePropertyFieldProps & { value: string | undefined }) {
  const { t } = useTranslation();
  const selected = property.options.find((option) => option.id === value);
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) =>
        onValueChange(next === CLEAR_VALUE ? null : next ?? null)
      }
      value={value ?? null}
    >
      <SelectTrigger
        aria-label={property.name}
        className={cn(
          "min-w-28 max-w-56",
          appearance === "composer" && composerSelectTriggerClassName,
          appearance === "metadata" && metadataSelectTriggerClassName,
          className
        )}
        size="sm"
      >
        {appearance === "composer" ? <PropertyTypeIcon type="select" /> : null}
        <SelectValue
          appearance={appearance}
          emptyLabel={emptyLabel}
          selected={selected}
        />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className={propertyPickerContentClassName("choice")}
      >
        <SelectGroup className="space-y-1 p-0">
          {property.options.map((option) => (
            <SelectItem
              className={propertyPickerOptionClassName}
              key={option.id}
              value={option.id}
            >
              <ChoiceValue color={option.color} name={option.name} />
            </SelectItem>
          ))}
        </SelectGroup>
        {selected ? (
          <SelectItem
            className="mt-2.5 h-6 w-fit py-0 pr-2 pl-2 text-xs font-medium"
            value={CLEAR_VALUE}
          >
            {t("extensions.catalog.lunaris.kanban.clear")}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

function SelectValue({
  appearance,
  emptyLabel,
  selected,
}: {
  appearance: PropertyFieldAppearance;
  emptyLabel?: string;
  selected: ChoicePropertyDefinition["options"][number] | undefined;
}) {
  const { t } = useTranslation();
  if (!selected) {
    return (
      <PropertyPlaceholder>
        {emptyLabel ??
          t("extensions.catalog.lunaris.kanban.propertyPlaceholders.select")}
      </PropertyPlaceholder>
    );
  }
  if (appearance !== "control") {
    return <ChoiceValue color={selected.color} name={selected.name} />;
  }
  return (
    <PropertyTag color={selected.color}>
      <span className="truncate">{selected.name}</span>
    </PropertyTag>
  );
}

export function MultiSelectPropertyField({
  appearance,
  className,
  disabled,
  emptyLabel,
  onValueChange,
  property,
  value,
}: ChoicePropertyFieldProps & { value: string[] }) {
  const { t } = useTranslation();
  const selected = property.options.filter((option) => value.includes(option.id));
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <PropertyFieldButton
            appearance={appearance}
            aria-label={property.name}
            className={cn(
              "h-auto min-h-7 min-w-28 max-w-64 justify-start px-2 py-1",
              className
            )}
          />
        }
      >
        {appearance === "composer" ? (
          <PropertyTypeIcon type="multi-select" />
        ) : null}
        <MultiSelectValue
          appearance={appearance}
          emptyLabel={emptyLabel}
          selected={selected}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={propertyPickerContentClassName("choice")}
      >
        <PropertyPickerList>
          {property.options.map((option) => {
            const checked = value.includes(option.id);
            return (
              <PropertyPickerOption
                checked={checked}
                key={option.id}
                onSelect={() => {
                  const next = checked
                    ? value.filter((id) => id !== option.id)
                    : [...value, option.id];
                  onValueChange(next.length > 0 ? next : null);
                }}
              >
                <ChoiceValue
                  className="min-w-0 flex-1"
                  color={option.color}
                  name={option.name}
                />
              </PropertyPickerOption>
            );
          })}
        </PropertyPickerList>
        {value.length > 0 ? (
          <PropertyPickerClearAction onClear={() => onValueChange(null)}>
            {t("extensions.catalog.lunaris.kanban.clear")}
          </PropertyPickerClearAction>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectValue({
  appearance,
  emptyLabel,
  selected,
}: {
  appearance: PropertyFieldAppearance;
  emptyLabel?: string;
  selected: ChoicePropertyDefinition["options"];
}) {
  const { t } = useTranslation();
  if (selected.length === 0) {
    return (
      <PropertyPlaceholder>
        {emptyLabel ??
          t(
            "extensions.catalog.lunaris.kanban.propertyPlaceholders.multi-select"
          )}
      </PropertyPlaceholder>
    );
  }

  const visibleCount =
    appearance === "composer" ? 1 : appearance === "control" ? 2 : selected.length;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1",
        appearance === "metadata" && "flex-wrap gap-x-3 gap-y-1"
      )}
    >
      {selected.slice(0, visibleCount).map((option) =>
        appearance !== "control" ? (
          <ChoiceValue
            className="max-w-full"
            color={option.color}
            key={option.id}
            name={option.name}
          />
        ) : (
          <PropertyTag
            className="min-w-0"
            color={option.color}
            key={option.id}
            title={option.name}
          >
            <span className="max-w-24 truncate">{option.name}</span>
          </PropertyTag>
        )
      )}
      {appearance !== "metadata" && selected.length > visibleCount ? (
        <span className="shrink-0 self-center text-xs text-muted-foreground">
          +{selected.length - visibleCount}
        </span>
      ) : null}
    </span>
  );
}

function ChoiceValue({
  className,
  color,
  name,
}: {
  className?: string;
  color: string;
  name: string;
}) {
  return (
    <span
      className={cn("flex min-w-0 items-center gap-2 text-sm", className)}
      title={name}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full ring-1 ring-foreground/10"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
