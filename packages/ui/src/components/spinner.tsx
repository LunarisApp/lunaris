import type { ComponentProps } from "react";
import { cn } from "@lunarisapp/ui/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";

function Spinner({
  className,
  size,
  strokeWidth,
  ...props
}: ComponentProps<"svg"> & { size?: number; strokeWidth?: number }) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      size={size}
      strokeWidth={strokeWidth ?? 2}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
