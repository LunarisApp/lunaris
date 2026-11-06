"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { ArrowLeft01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

interface MobileHeaderProps {
  actions?: ReactNode;
  backTo?: string;
  subtitle?: ReactNode;
  title: string;
  titleTrailing?: ReactNode;
}

export function MobileHeader({
  actions,
  backTo,
  subtitle,
  title,
  titleTrailing,
}: MobileHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="shrink-0 border-border/60 border-b bg-background pt-[var(--safe-area-top)] pr-[calc(0.75rem+var(--safe-area-right))] pl-[calc(0.75rem+var(--safe-area-left))]">
      <div className="flex min-h-16 items-center gap-2 py-2">
        {!!backTo && (
          <Button
            className="size-11 shrink-0 rounded-xl active:bg-muted"
            nativeButton={false}
            render={<Link to={backTo} />}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <span className="sr-only">{t("common.back")}</span>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-base">{title}</h1>
          {subtitle ? (
            <div className="line-clamp-2 text-muted-foreground text-xs leading-4">
              {subtitle}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {titleTrailing}
          {actions}
        </div>
      </div>
    </header>
  );
}
