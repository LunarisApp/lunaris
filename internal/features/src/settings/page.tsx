"use client";

import {
  HardDriveIcon,
  KeyboardIcon,
  Setting07Icon,
  UserIcon,
} from "@lunarisapp/ui/icons";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router";
import { useAuth } from "../auth";
import { preloadSettingsData } from "./queries";
import { SettingsLayout, type SettingsNavigationItem } from "./settings-layout";
import type { Shell, TabId } from "./types";

interface SettingsPageProps {
  buildVersion?: ReactNode;
  shell: Shell;
}

export function SettingsPage({ buildVersion, shell }: SettingsPageProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { data: session, isPending } = auth.useSession();
  const isAnonymous = session?.user?.isAnonymous ?? false;

  useEffect(() => {
    if (isPending) return;
    void preloadSettingsData({
      auth,
      isAnonymous,
      queryClient,
    });
  }, [auth, isAnonymous, isPending, queryClient]);

  if (shell === "mobile") {
    return (
      <div className="flex h-dvh flex-col">
        <Outlet />
      </div>
    );
  }
  return <DesktopSettingsPage buildVersion={buildVersion} />;
}

function DesktopSettingsPage({ buildVersion }: { buildVersion?: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const auth = useAuth();
  const { data: activeOrg } = auth.useActiveOrganization();
  const homePath = activeOrg ? `/${activeOrg.slug}` : "/";

  const tabs = useMemo<SettingsNavigationItem[]>(() => {
    const items: {
      description: string;
      icon: SettingsNavigationItem["icon"];
      id: TabId;
      label: string;
    }[] = [
      {
        description: t("settings.account.description"),
        icon: UserIcon,
        id: "account",
        label: t("settings.tabs.account"),
      },
    ];
    items.push(
      {
        description: t("settings.preferences.description"),
        icon: Setting07Icon,
        id: "preferences",
        label: t("settings.tabs.preferences"),
      },
      {
        description: t("settings.keybindings.description"),
        icon: KeyboardIcon,
        id: "keybindings",
        label: t("settings.tabs.keybindings"),
      },
      {
        description: t("settings.local-data.description"),
        icon: HardDriveIcon,
        id: "local-data",
        label: t("settings.tabs.local-data"),
      },
    );
    return items.map((item) => {
      const to = `/settings/${item.id}`;
      return {
        ...item,
        isActive: pathname === to,
        testId: `settings-tab-${item.id}`,
        to,
      };
    });
  }, [pathname, t]);
  const activeTab = tabs.find((tab) => tab.isActive) ?? tabs[0];

  return (
    <SettingsLayout
      backLabel={t("common.back")}
      backTo={homePath}
      contentDescription={activeTab?.description}
      contentTitle={activeTab?.label ?? t("settings.tabs.account")}
      footer={buildVersion}
      items={tabs}
      skipToContentLabel={t("common.skipToContent")}
      testId="settings-page"
      title={t("settings.title")}
    >
      <Outlet />
    </SettingsLayout>
  );
}
