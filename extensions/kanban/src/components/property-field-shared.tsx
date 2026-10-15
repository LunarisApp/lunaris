import { Button } from "@lunarisapp/ui/components/button";
import {
  Calendar03Icon,
  CheckmarkSquare02Icon,
  File01Icon,
  HugeiconsIcon,
  type IconSvgObject,
  InputNumericIcon,
  Tag01Icon,
  TagsIcon,
  TextIcon,
  UserMultipleIcon,
} from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import type { PropertyType } from "../types";

export type PropertyFieldAppearance = "composer" | "control" | "metadata";

export const composerButtonClassName =
  "h-8! min-w-0! justify-start overflow-hidden border-border/70 bg-background/70 px-2.5 text-left shadow-none hover:bg-muted/50 aria-expanded:bg-muted/50";

export const composerInputClassName =
  "h-8! min-w-0! border-border/70 bg-background/70 px-2.5 shadow-none hover:bg-muted/50 focus-visible:bg-background";

export const composerSelectTriggerClassName =
  "h-8! min-w-0! border-border/70 bg-background/70 px-2.5 text-left shadow-none hover:bg-muted/50 aria-expanded:bg-muted/50 [&>svg:last-child]:hidden";

export const metadataButtonClassName =
  "min-w-0 rounded-md border-transparent bg-transparent px-1.5 text-left shadow-none hover:bg-muted/60 disabled:bg-transparent disabled:opacity-100";

export const metadataInputClassName =
  "border-transparent bg-transparent px-1.5 shadow-none hover:bg-muted/60 focus-visible:bg-background disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:hover:bg-muted/50";

export const metadataSelectTriggerClassName =
  "min-w-0 rounded-md border-transparent bg-transparent px-1.5 text-left shadow-none hover:bg-muted/60 disabled:cursor-default disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:hover:bg-muted/50 [&>svg:last-child]:hidden";

export function PropertyFieldButton({
  appearance,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "size" | "variant"> & {
  appearance: PropertyFieldAppearance;
}) {
  return (
    <Button
      {...props}
      className={cn(
        appearance === "composer" && composerButtonClassName,
        appearance === "metadata" && metadataButtonClassName,
        className
      )}
      size="sm"
      variant={appearance === "metadata" ? "ghost" : "outline"}
    />
  );
}

export function PropertyPlaceholder({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("truncate text-xs text-muted-foreground", className)}>
      {children}
    </span>
  );
}

export function PropertyTypeIcon({
  className,
  type,
}: {
  className?: string;
  type: PropertyType;
}) {
  return (
    <HugeiconsIcon
      aria-hidden="true"
      className={cn("shrink-0 text-muted-foreground", className)}
      icon={propertyTypeIconObject(type)}
      size={14}
      strokeWidth={2}
    />
  );
}

function propertyTypeIconObject(type: PropertyType): IconSvgObject {
  switch (type) {
    case "checkbox":
      return CheckmarkSquare02Icon;
    case "date":
      return Calendar03Icon;
    case "resource":
      return File01Icon;
    case "multi-select":
      return TagsIcon;
    case "number":
      return InputNumericIcon;
    case "people":
      return UserMultipleIcon;
    case "select":
      return Tag01Icon;
    case "text":
      return TextIcon;
  }
}
