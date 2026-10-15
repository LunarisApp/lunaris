import { Badge } from "@lunarisapp/ui/components/badge";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { ComponentProps, CSSProperties } from "react";

const FALLBACK_COLOR = "var(--muted-foreground)";

export function getPropertyTagStyle(color: string): CSSProperties {
  const tagColor = color.trim() || FALLBACK_COLOR;

  return {
    backgroundColor: `color-mix(in oklab, ${tagColor} 14%, transparent)`,
    borderColor: `color-mix(in oklab, ${tagColor} 24%, transparent)`,
    color: `color-mix(in oklab, ${tagColor} 72%, var(--foreground))`,
  };
}

export function PropertyTag({
  className,
  color,
  ...props
}: ComponentProps<typeof Badge> & { color: string }) {
  return (
    <Badge
      className={cn("max-w-full border font-medium", className)}
      style={getPropertyTagStyle(color)}
      variant="outline"
      {...props}
    />
  );
}
