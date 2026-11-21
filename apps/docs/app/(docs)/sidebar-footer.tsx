"use client";

import Github from "@thesvg/react/github";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";

export function SidebarFooter() {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
      <a
        aria-label="GitHub"
        className={buttonVariants({
          className: "text-fd-muted-foreground",
          size: "icon",
          variant: "ghost",
        })}
        href="https://github.com/LunarisApp/lunaris"
      >
        <Github aria-hidden="true" variant="mono" />
      </a>
      <ThemeSwitch />
    </div>
  );
}
