import type { PluginUser } from "@lunarisapp/plugin-sdk";
import { Checkbox } from "@lunarisapp/ui/components/checkbox";
import { cn } from "@lunarisapp/ui/lib/utils";
import { useId } from "react";
import { isResourcePropertyValue } from "../property-codec";
import type { PropertyDefinition, PropertyValue } from "../types";
import {
  MultiSelectPropertyField,
  SelectPropertyField,
} from "./property-choice-fields";
import { ResourceField } from "./property-resource-field";
import type { PropertyFieldAppearance } from "./property-field-shared";
import { PeopleField } from "./property-people-field";
import { DateField, DraftField } from "./property-scalar-fields";

export { PersonAvatar, personLabel } from "./property-people-field";

interface PropertyValueFieldProps {
  appearance?: PropertyFieldAppearance;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  onValueChange: (value: PropertyValue | null) => void;
  people?: Map<string, PluginUser>;
  property: PropertyDefinition;
  value: PropertyValue | undefined;
}

export function PropertyValueField({
  appearance = "control",
  className,
  disabled = false,
  emptyLabel,
  onValueChange,
  people = new Map(),
  property,
  value,
}: PropertyValueFieldProps) {
  const fieldProps = {
    appearance,
    className,
    disabled,
    emptyLabel,
    onValueChange,
  };

  switch (property.type) {
    case "select":
      return (
        <SelectPropertyField
          {...fieldProps}
          property={property}
          value={typeof value === "string" ? value : undefined}
        />
      );
    case "multi-select":
      return (
        <MultiSelectPropertyField
          {...fieldProps}
          property={property}
          value={Array.isArray(value) ? value : []}
        />
      );
    case "people":
      return (
        <PeopleField
          {...fieldProps}
          people={people}
          propertyName={property.name}
          value={Array.isArray(value) ? value : []}
        />
      );
    case "resource":
      return (
        <ResourceField
          {...fieldProps}
          propertyName={property.name}
          value={isResourcePropertyValue(value) ? value : undefined}
        />
      );
    case "date":
      return (
        <DateField
          {...fieldProps}
          propertyName={property.name}
          value={typeof value === "string" ? value : undefined}
        />
      );
    case "text":
      return (
        <DraftField
          {...fieldProps}
          propertyName={property.name}
          value={typeof value === "string" ? value : ""}
        />
      );
    case "number":
      return (
        <DraftField
          {...fieldProps}
          number
          propertyName={property.name}
          value={typeof value === "number" ? String(value) : ""}
        />
      );
    case "checkbox":
      if (appearance === "composer") {
        return (
          <ComposerCheckboxField
            checked={value === true}
            className={className}
            disabled={disabled}
            onCheckedChange={(checked) => onValueChange(checked)}
            propertyName={property.name}
          />
        );
      }
      return (
        <Checkbox
          aria-label={property.name}
          checked={value === true}
          className={className}
          disabled={disabled}
          onCheckedChange={(checked) => onValueChange(checked)}
        />
      );
  }
}

function ComposerCheckboxField({
  checked,
  className,
  disabled,
  onCheckedChange,
  propertyName,
}: {
  checked: boolean;
  className?: string;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  propertyName: string;
}) {
  const id = useId();
  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-border/70 bg-background/70 px-2.5 text-left text-muted-foreground text-xs shadow-none transition-colors hover:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
        className
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      />
      <label className="min-w-0 cursor-pointer truncate" htmlFor={id}>
        {propertyName}
      </label>
    </span>
  );
}
