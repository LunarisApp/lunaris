import { cn } from "@lunarisapp/ui/lib/utils";
import type { ComponentProps } from "react";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-muted rounded-md animate-pulse", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
