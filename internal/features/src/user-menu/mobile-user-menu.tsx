"use client";

import { Separator } from "@lunarisapp/ui/components/separator";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Drawer,
  DrawerMenuItem,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@lunarisapp/ui/components/drawer";
import {
  Add01Icon,
  HelpCircleIcon,
  HugeiconsIcon,
  Logout03Icon,
  Settings01Icon,
} from "@lunarisapp/ui/icons";
import { usePlatform } from "@repo/platform";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "../auth/components/user-avatar";
import { useAuth } from "../auth/context";
import { useSettings } from "../settings/context";
import { useAccountSwitcher } from "./use-account-switcher";

interface MobileUserMenuProps {
  onLogout?: () => void;
}

function MenuItem({
  children,
  destructive,
  icon,
  onClick,
  trailing,
}: {
  children: ReactNode;
  destructive?: boolean;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <DrawerMenuItem
      onClick={onClick}
      variant={destructive ? "destructive" : "default"}
    >
      <HugeiconsIcon icon={icon} />
      <span className="flex-1">{children}</span>
      {trailing}
    </DrawerMenuItem>
  );
}

export function MobileUserMenu({ onLogout }: MobileUserMenuProps) {
  const { t } = useTranslation();
  const { navigation } = usePlatform();
  const settings = useSettings();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const {
    accountListStatus,
    accounts,
    addAccount,
    currentUserId,
    isSwitching,
    refreshAccounts,
    switchAccount,
  } = useAccountSwitcher();

  const user = session?.user;
  const otherAccounts = accounts.filter(
    (account) => account.user.id !== currentUserId
  );

  return (
    <Drawer
      onOpenChange={(open: boolean) => {
        if (open) {
          void refreshAccounts();
        }
      }}
    >
      <DrawerTrigger
        render={
          <Button
            aria-label={t("auth.accounts")}
            className="touch-target"
            size="icon"
            variant="ghost"
          >
            <UserAvatar className="size-full rounded-[inherit]" user={user} />
          </Button>
        }
      />
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="flex-row items-center gap-3 pb-4">
          <UserAvatar className="rounded-lg" size="lg" user={user} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <DrawerTitle className="truncate text-left">
              {user?.name || user?.email || t("common.user")}
            </DrawerTitle>
            {!!(user?.name && user?.email) && (
              <p className="truncate text-left text-muted-foreground text-sm">
                {user.email}
              </p>
            )}
          </div>
        </DrawerHeader>
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          {otherAccounts.length > 0 ? (
            <p className="px-3 pt-2 pb-2 font-medium text-muted-foreground text-xs">
              {t("auth.accounts")}
            </p>
          ) : null}
          {otherAccounts.map((account) => (
            <DrawerMenuItem
              disabled={isSwitching}
              key={account.user.id}
              onClick={() => void switchAccount(account)}
            >
              <UserAvatar size="sm" user={account.user} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {account.user.name || account.user.email}
                </span>
                {account.user.name ? (
                  <span className="block truncate text-muted-foreground text-xs">
                    {account.user.email}
                  </span>
                ) : null}
              </span>
            </DrawerMenuItem>
          ))}
          {accountListStatus === "ready" ? null : (
            <div
              className="mx-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2"
              role={accountListStatus === "error" ? "alert" : "status"}
            >
              <span className="flex-1 text-muted-foreground text-xs">
                {t(
                  accountListStatus === "offline"
                    ? "auth.accountListOffline"
                    : "auth.accountListFailed"
                )}
              </span>
              {accountListStatus === "error" ? (
                <Button
                  onClick={() => void refreshAccounts()}
                  size="xs"
                  variant="ghost"
                >
                  {t("common.retry")}
                </Button>
              ) : null}
            </div>
          )}
          <MenuItem icon={Add01Icon} onClick={addAccount}>
            {t("auth.addAccount")}
          </MenuItem>
          <Separator className="my-1" />
          <MenuItem icon={Settings01Icon} onClick={settings.open}>
            {t("common.settings")}
          </MenuItem>
          <MenuItem
            icon={HelpCircleIcon}
            onClick={() => navigation.open("mailto:hello@lunaris.app")}
          >
            {t("helpCenter.needHelp")}
          </MenuItem>
          <Separator className="my-1" />
          <MenuItem
            destructive
            icon={Logout03Icon}
            onClick={() => onLogout?.()}
          >
            {accounts.length > 1
              ? t("auth.logoutAllAccounts")
              : t("common.logout")}
          </MenuItem>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
