import { cn } from "@lunarisapp/ui/lib/utils";
import type { HTMLAttributes } from "react";

export function Appbar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={cn("flex h-12 items-center justify-between px-2.5", className)}
      {...props}
    />
  );
}

function AppbarSection({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
      {...props}
    />
  );
}

Appbar.Leading = function AppbarLeading({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppbarSection className={cn("justify-start", className)} {...props} />
  );
};

Appbar.Trailing = function AppbarTrailing({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppbarSection className={cn("justify-end", className)} {...props} />;
};

Appbar.Middle = function AppbarMiddle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppbarSection className={cn("justify-center", className)} {...props} />
  );
};
