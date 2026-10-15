"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MobileHeader } from "../mobile";
import type { TabId } from "./types";

interface MobileTabPageProps {
  children: ReactNode;
  tab: TabId;
}

export function MobileTabPage({ children, tab }: MobileTabPageProps) {
  const { t } = useTranslation();
  return (
    <>
      <MobileHeader
        backTo="/settings"
        subtitle={t(`settings.${tab}.description`)}
        title={t(`settings.tabs.${tab}`)}
      />
      <main className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
        {children}
      </main>
    </>
  );
}
