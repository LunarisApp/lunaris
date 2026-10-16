"use client";

import {
  ArrowRight01Icon,
  HardDriveIcon,
  HugeiconsIcon,
  type IconSvgObject,
  Setting07Icon,
  UserIcon,
} from "@lunarisapp/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAuth } from "../auth";
import { MobileHeader } from "../mobile";
import type { TabId } from "./types";

interface TabEntry {
  icon: IconSvgObject;
  id: TabId;
  label: string;
}

export function MobileSettingsIndexPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: activeOrg } = auth.useActiveOrganization();
  const backTo = activeOrg ? `/${activeOrg.slug}` : "/";

  const tabs = useMemo<TabEntry[]>(() => {
    const items: TabEntry[] = [
      { id: "account", label: t("settings.tabs.account"), icon: UserIcon },
    ];
    items.push(
      {
        id: "preferences",
        label: t("settings.tabs.preferences"),
        icon: Setting07Icon,
      },
      {
        id: "local-data",
        label: t("settings.tabs.local-data"),
        icon: HardDriveIcon,
      }
    );
    return items;
  }, [t]);

  return (
    <>
      <MobileHeader backTo={backTo} title={t("settings.title")} />
      <main className="flex-1 overflow-y-auto px-3 py-4">
        <nav aria-label={t("settings.title")}>
          <ul className="divide-y">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <Link
                  className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-accent/50 active:bg-accent"
                  data-testid={`settings-tab-${tab.id}`}
                  to={`/settings/${tab.id}`}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                    icon={tab.icon}
                    strokeWidth={2}
                  />
                  <span className="flex-1">{tab.label}</span>
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </>
  );
}
