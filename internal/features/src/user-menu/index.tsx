"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@lunarisapp/ui/components/dropdown-menu";
import { Add01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "../auth/components/user-avatar";
import { useAuth } from "../auth/context";
import { useHotkeyDisplay } from "../hotkeys";
import { useSettings } from "../settings/context";
import { useAccountSwitcher } from "./use-account-switcher";

export { MobileUserMenu } from "./mobile-user-menu";

interface UserMenuProps {
  align?: ComponentProps<typeof DropdownMenuContent>["align"];
  onLogout?: () => void;
  side?: ComponentProps<typeof DropdownMenuContent>["side"];
}

const userMenuAvatarClass =
  "cursor-pointer rounded-lg after:rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg [&_[data-slot=avatar-image]]:rounded-lg";

export function UserMenu({
  align = "end",
  onLogout,
  side = "bottom",
}: UserMenuProps) {
  const { t } = useTranslation();
  const settingsShortcut = useHotkeyDisplay("open-settings");
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
    <DropdownMenu
      modal={false}
      onOpenChange={(open: boolean) => {
        if (open) void refreshAccounts();
      }}
    >
      <DropdownMenuTrigger
        data-testid="user-menu-trigger"
        nativeButton={false}
        render={<UserAvatar className={userMenuAvatarClass} user={user} />}
      />
      <DropdownMenuContent align={align} className="w-64" side={side}>
        <DropdownMenuRadioGroup value={currentUserId}>
          <DropdownMenuLabel>{t("auth.accounts")}</DropdownMenuLabel>
          {accounts.map((account) => (
            <DropdownMenuRadioItem
              className="py-1.5"
              disabled={
                account.user.id === currentUserId || isSwitching
              }
              key={account.user.id}
              onClick={() => void switchAccount(account)}
              value={account.user.id}
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
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {accountListStatus !== "ready" ? (
          <div
            className="mx-2 my-1 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5"
            role={accountListStatus === "error" ? "alert" : "status"}
          >
            <span className="text-muted-foreground flex-1 text-xs">
              {t(
                accountListStatus === "offline"
                  ? "auth.accountListOffline"
                  : "auth.accountListFailed",
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
        <DropdownMenuItem onClick={addAccount}>
          <HugeiconsIcon icon={Add01Icon} />
          {t("auth.addAccount")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="user-menu-settings"
          onClick={settings.open}
        >
          {t("common.settings")}
          <DropdownMenuShortcut aria-hidden="true">
            {settingsShortcut}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onLogout}
        >
          {accounts.length > 1
            ? t("auth.logoutAllAccounts")
            : t("common.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
