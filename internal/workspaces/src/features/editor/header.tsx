import { cn } from "@lunarisapp/ui/lib/utils";
import type { HTMLAttributes } from "react";

export function EditorHeader({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={cn(
        "grid h-8 flex-none grid-cols-[1fr_auto_1fr] items-center px-2.5",
        className
      )}
      {...props}
    />
  );
}

function EditorHeaderSection({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2", className)}
      {...props}
    />
  );
}

EditorHeader.Leading = function Leading({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <EditorHeaderSection
      className={cn("justify-start", className)}
      {...props}
    />
  );
};

EditorHeader.Trailing = function Trailing({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <EditorHeaderSection className={cn("justify-end", className)} {...props} />
  );
};

EditorHeader.Middle = function Middle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <EditorHeaderSection
      className={cn("justify-center", className)}
      {...props}
    />
  );
};
