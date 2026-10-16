import { cn } from "@lunarisapp/ui/lib/utils";
import type { HTMLAttributes } from "react";

export function WorkspaceLayout({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-dvh w-dvw flex-col overflow-hidden overscroll-none bg-sidebar px-2.5",
        className
      )}
      id="workspace-layout"
      {...props}
    />
  );
}

WorkspaceLayout.Content = function WorkspaceLayoutContent(
  props: HTMLAttributes<HTMLElement>
) {
  return (
    <main
      className="min-h-0 flex-1 focus:outline-none"
      id="main-content"
      tabIndex={-1}
      {...props}
    />
  );
};
