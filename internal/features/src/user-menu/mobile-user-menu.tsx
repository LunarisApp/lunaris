"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Drawer,
  DrawerClose,
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
  Tick02Icon,
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

const userMenuAvatarClass =
  "cursor-pointer rounded-lg after:rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg [&_[data-slot=avatar-image]]:rounded-lg";

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
    <DrawerClose
      render={
        <button
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors active:bg-accent ${destructive ? "text-destructive" : ""}`}
          onClick={onClick}
          type="button"
        >
          <HugeiconsIcon className="size-5" icon={icon} />
          <span className="flex-1">{children}</span>
          {trailing}
        </button>
      }
    />
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

  return (
    <Drawer
      onOpenChange={(open: boolean) => {
        if (open) void refreshAccounts();
      }}
    >
      <DrawerTrigger
        render={<UserAvatar className={userMenuAvatarClass} user={user} />}
      />
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="flex-row items-center gap-3">
          <UserAvatar className={userMenuAvatarClass} size="lg" user={user} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <DrawerTitle className="truncate text-left">
              {user?.name || user?.email || t("common.user")}
            </DrawerTitle>
            {user?.name && user?.email && (
              <p className="truncate text-left text-sm text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </DrawerHeader>
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          <p className="text-muted-foreground px-3 py-1 text-xs font-medium">
            {t("auth.accounts")}
          </p>
          {accounts.map((account) => {
            const active = account.user.id === currentUserId;
            return (
              <DrawerClose
                key={account.user.id}
                render={
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors active:bg-accent disabled:opacity-60"
                    disabled={active || isSwitching}
                    onClick={() => void switchAccount(account)}
                    type="button"
                  >
                    <UserAvatar size="sm" user={account.user} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {account.user.name || account.user.email}
                      </span>
                      {account.user.name ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {account.user.email}
                        </span>
                      ) : null}
                    </span>
                    {active ? (
                      <HugeiconsIcon className="size-4" icon={Tick02Icon} />
                    ) : null}
                  </button>
                }
              />
            );
          })}
          {accountListStatus !== "ready" ? (
            <div
              className="mx-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2"
              role={accountListStatus === "error" ? "alert" : "status"}
            >
              <span className="text-muted-foreground flex-1 text-xs">
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
          ) : null}
          <MenuItem icon={Add01Icon} onClick={addAccount}>
            {t("auth.addAccount")}
          </MenuItem>
          <div className="my-1 h-px bg-border" />
          <MenuItem icon={Settings01Icon} onClick={settings.open}>
            {t("common.settings")}
          </MenuItem>
          <MenuItem
            icon={HelpCircleIcon}
            onClick={() => navigation.open("mailto:hello@lunaris.app")}
          >
            {t("helpCenter.needHelp")}
          </MenuItem>
          <div className="my-1 h-px bg-border" />
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
