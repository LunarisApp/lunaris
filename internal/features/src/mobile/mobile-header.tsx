"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { ArrowLeft01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

interface MobileHeaderProps {
  actions?: ReactNode;
  backTo?: string;
  subtitle?: string;
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
    <header className="shrink-0 border-b pl-[calc(0.75rem+var(--safe-area-left))] pr-[calc(0.75rem+var(--safe-area-right))] pt-[var(--safe-area-top)]">
      <div className="flex min-h-14 items-center gap-2 py-2">
        {backTo && (
          <Button
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
          <h1 className="truncate text-base font-medium">{title}</h1>
          {subtitle ? (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-4">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {titleTrailing}
          {actions}
        </div>
      </div>
    </header>
  );
}
