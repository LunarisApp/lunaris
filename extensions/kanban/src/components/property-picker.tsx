import { Button } from "@lunarisapp/ui/components/button";
import { HugeiconsIcon, Tick02Icon } from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type PropertyPickerWidth = "choice" | "resource" | "people";

const widthClassNames = {
  choice: "w-[min(16rem,calc(100vw-2rem))]",
  resource: "w-[min(20rem,calc(100vw-2rem))]",
  people: "w-[min(18rem,calc(100vw-2rem))]",
} satisfies Record<PropertyPickerWidth, string>;

export const propertyPickerOptionClassName = "py-1.5 pr-8 pl-2";

export function propertyPickerContentClassName(
  width: PropertyPickerWidth
): string {
  return cn("max-w-(--available-width) p-2.5", widthClassNames[width]);
}

export function PropertyPickerList({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "max-h-64 space-y-1 overflow-y-auto overscroll-contain",
        className
      )}
      {...props}
    />
  );
}

export function PropertyPickerOption({
  checked,
  children,
  className,
  onSelect,
}: {
  checked: boolean;
  children: ReactNode;
  className?: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        className
      )}
      onClick={onSelect}
      type="button"
    >
      {children}
      <SelectionMark checked={checked} />
    </button>
  );
}

function SelectionMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-foreground transition-opacity",
        checked ? "opacity-100" : "opacity-0"
      )}
    >
      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.25} />
    </span>
  );
}

export function PropertyPickerMessage({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "px-2 py-4 text-center text-muted-foreground text-xs",
        className
      )}
      {...props}
    />
  );
}

export function PropertyPickerClearAction({
  children,
  onClear,
}: {
  children: ReactNode;
  onClear: () => void;
}) {
  return (
    <Button onClick={onClear} size="xs" variant="ghost">
      {children}
    </Button>
  );
}
