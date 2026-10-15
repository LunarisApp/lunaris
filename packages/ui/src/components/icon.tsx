import { HugeiconsIcon, type IconSource } from "../icons";
import { cn } from "../lib/utils";
import { isValidElement } from "react";

export function Icon({
  className,
  icon,
  strokeWidth,
}: {
  className?: string;
  icon: IconSource;
  strokeWidth?: number;
}) {
  if (isValidElement(icon)) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center [&>svg]:size-full",
          className
        )}
      >
        {icon}
      </span>
    );
  }

  return (
    <HugeiconsIcon
      className={className}
      icon={icon}
      strokeWidth={strokeWidth}
    />
  );
}
