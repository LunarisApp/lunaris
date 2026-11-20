import type { ComponentProps } from "react";
import { cn } from "@lunarisapp/ui/lib/utils";

function Spinner({
  className,
  size = 24,
  strokeWidth = 2,
  ...props
}: ComponentProps<"svg"> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn(
        "size-4 motion-safe:animate-spin motion-safe:[animation-duration:var(--duration,1s)]",
        className
      )}
      {...props}
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export { Spinner };
