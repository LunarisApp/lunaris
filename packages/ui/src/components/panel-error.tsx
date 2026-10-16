import {
  Alert02Icon,
  HugeiconsIcon,
  type IconSvgObject,
  InformationCircleIcon,
  Search01Icon,
} from "@lunarisapp/ui/icons";
import type { ComponentProps, ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

/** Panel error variant type for default icon selection */
type PanelErrorVariant = "error" | "not-found" | "generic";

/** Default icons for each error variant */
const defaultIcons: Record<PanelErrorVariant, IconSvgObject> = {
  error: Alert02Icon,
  "not-found": Search01Icon,
  generic: InformationCircleIcon,
};

interface PanelErrorProps extends ComponentProps<"div"> {
  /** Optional action buttons */
  actions?: ReactNode;
  /** Error description/message */
  description?: string;
  /** Icon element or Hugeicons icon component. Use `variant` for default icons. */
  icon?: ReactNode | IconSvgObject;
  /** Error title */
  title: string;
  /** Error variant for default icon selection (default: "generic") */
  variant?: PanelErrorVariant;
}

/** Check if value is a Hugeicons icon object (IconSvgObject) */
function isIconSvgObject(value: unknown): value is IconSvgObject {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]);
}

/**
 * Reusable error layout component for displaying error, not-found, and failure states.
 * Fills parent container height using flex.
 */
function PanelError({
  title,
  description,
  icon,
  variant = "generic",
  actions,
  ...props
}: PanelErrorProps) {
  // Determine icon to display: explicit icon prop, or default based on variant
  const resolvedIcon = icon ?? defaultIcons[variant];

  // Render icon: if IconSvgObject, wrap in HugeiconsIcon; else render as ReactNode
  const iconElement = isIconSvgObject(resolvedIcon) ? (
    <HugeiconsIcon icon={resolvedIcon} strokeWidth={2} />
  ) : (
    resolvedIcon
  );

  return (
    <Empty className="h-full flex-1" {...props}>
      <EmptyHeader>
        {!!iconElement && <EmptyMedia variant="icon">{iconElement}</EmptyMedia>}
        <EmptyTitle aria-level={2} role="heading">
          {title}
        </EmptyTitle>
        {!!description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {!!actions && <EmptyContent>{actions}</EmptyContent>}
    </Empty>
  );
}

export type { PanelErrorProps, PanelErrorVariant };
export { PanelError };
