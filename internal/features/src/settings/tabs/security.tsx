"use client";

import { Google } from "@lunarisapp/ui/brand-icons";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lunarisapp/ui/components/dropdown-menu";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import {
  ArrowDown01Icon,
  ComputerIcon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../auth";
import {
  buildAddAccountPath,
  buildAuthRedirectPath,
} from "../../auth/redirect";
import { useRegion } from "../../region";
import {
  type AccountInfo,
  authSupportsPasskeys,
  isSessionNotFreshError,
  type SessionInfo,
  securityAccountsQueryOptions,
  securitySessionsQueryOptions,
  settingsQueryKeys,
} from "../queries";
import { PasskeySection } from "./passkey-section";
import { ChangePasswordDialog, SetPasswordDialog } from "./password-dialogs";
import {
  DisableTwoFactorDialog,
  RegenerateBackupCodesDialog,
  TwoFactorSetupDialog,
} from "./two-factor-dialogs";

function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = "Unknown";
  let os = "Unknown";

  if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = "Firefox";
  } else if (/EdgA?\/|EdgiOS\//i.test(ua)) {
    browser = "Edge";
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(ua)) {
    browser = "Safari";
  }

  if (/Windows/i.test(ua)) {
    os = "Windows";
  } else if (/Android/i.test(ua)) {
    os = "Android";
  } else if (/iPhone|iPad/i.test(ua)) {
    os = "iOS";
  } else if (/Mac OS/i.test(ua)) {
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  }

  return { browser, os };
}

function formatRelativeDate(date: Date, locale?: string): string {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const elapsedSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(elapsedSeconds);
  let value = elapsedSeconds;
  let unit: Intl.RelativeTimeFormatUnit = "second";

  if (absoluteSeconds >= 86_400) {
    value = Math.round(elapsedSeconds / 86_400);
    unit = "day";
  } else if (absoluteSeconds >= 3600) {
    value = Math.round(elapsedSeconds / 3600);
    unit = "hour";
  } else if (absoluteSeconds >= 60) {
    value = Math.round(elapsedSeconds / 60);
    unit = "minute";
  }

  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    value,
    unit
  );
}

type PasswordSectionProps =
  | { hasPassword: true; onPasswordSet?: never }
  | { hasPassword: false; onPasswordSet: () => void };

export function PasswordSection(props: PasswordSectionProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section
      aria-labelledby="security-password-heading"
      className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between"
      data-testid="settings-security-password"
    >
      <div className="min-w-0 space-y-1">
        <h4 className="font-medium text-sm" id="security-password-heading">
          {t("settings.security.passwordTitle")}
        </h4>
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          {props.hasPassword
            ? t("settings.security.changePasswordDescription")
            : t("settings.security.setPasswordDescription")}
        </p>
      </div>
      <Button
        className="h-11 w-full shrink-0 lg:h-8 lg:w-auto"
        onClick={() => setDialogOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        {props.hasPassword
          ? t("settings.security.changePassword")
          : t("settings.security.setPassword")}
      </Button>

      {props.hasPassword ? (
        <ChangePasswordDialog onOpenChange={setDialogOpen} open={dialogOpen} />
      ) : (
        <SetPasswordDialog
          onOpenChange={setDialogOpen}
          onPasswordSet={props.onPasswordSet}
          open={dialogOpen}
        />
      )}
    </section>
  );
}

export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { refetch: refetchSession } = auth.useSession();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [setupOpen, setSetupOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => setIsEnabled(enabled), [enabled]);

  const handleEnabled = () => {
    setIsEnabled(true);
    void refetchSession();
  };

  return (
    <section
      aria-labelledby="security-two-factor-heading"
      className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between"
      data-testid="settings-security-two-factor"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium text-sm" id="security-two-factor-heading">
            {t("settings.security.twoFactorTitle")}
          </h4>
          <Badge
            aria-live="polite"
            variant={isEnabled ? "default" : "secondary"}
          >
            {isEnabled
              ? t("settings.security.twoFactorEnabled")
              : t("settings.security.twoFactorDisabled")}
          </Badge>
        </div>
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          {t("settings.security.twoFactorDescription")}
        </p>
      </div>

      <div className="flex w-full flex-col gap-2 lg:w-auto lg:shrink-0 lg:flex-row lg:flex-wrap lg:justify-end">
        {isEnabled ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button
                  className="h-11 w-full lg:h-8 lg:w-auto"
                  size="sm"
                  type="button"
                  variant="outline"
                />
              }
            >
              {t("settings.security.manageTwoFactor")}
              <HugeiconsIcon
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
                icon={ArrowDown01Icon}
                strokeWidth={2}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => setRegenerateOpen(true)}>
                {t("settings.security.regenerateBackupCodes")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="settings-security-two-factor-disable"
                onClick={() => setDisableOpen(true)}
                variant="destructive"
              >
                {t("settings.security.disableTwoFactor")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            className="h-11 w-full lg:h-8 lg:w-auto"
            data-testid="settings-security-two-factor-enable"
            onClick={() => setSetupOpen(true)}
            size="sm"
            type="button"
          >
            {t("settings.security.setUpTwoFactor")}
          </Button>
        )}
      </div>

      <TwoFactorSetupDialog
        onEnabled={handleEnabled}
        onOpenChange={setSetupOpen}
        open={setupOpen}
      />
      <RegenerateBackupCodesDialog
        onOpenChange={setRegenerateOpen}
        onRegenerated={() => setRegenerateOpen(false)}
        open={regenerateOpen}
      />
      <DisableTwoFactorDialog
        onDisabled={() => setIsEnabled(false)}
        onOpenChange={setDisableOpen}
        open={disableOpen}
      />
    </section>
  );
}

export function GoogleAccountSection({
  accounts,
  loading,
  onRefresh,
}: {
  accounts: AccountInfo[];
  loading: boolean;
  onRefresh: () => Promise<AccountInfo[]>;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { authUrl, pathWithRegion } = useRegion();
  const location = useLocation();
  const [action, setAction] = useState<"connect" | "disconnect" | null>(null);

  const googleAccount = accounts.find(
    (account) => account.providerId === "google"
  );
  const signInMethods = accounts.filter(
    (account) =>
      account.providerId === "credential" || account.providerId === "google"
  );
  const isDisconnectBlocked = signInMethods.length <= 1;

  const handleConnect = async () => {
    setAction("connect");
    posthog.capture("google_account_link_attempted");
    try {
      const result = await auth.linkSocial({
        provider: "google",
        callbackURL: authUrl(
          buildAuthRedirectPath(pathWithRegion("/auth"), location)
        ),
      });
      if (result.error) {
        const ufe = getUserFacingError(result.error);
        toast.error(t(ufe.titleKey), {
          description: getUserFacingDescription(ufe, t),
        });
        return;
      }

      const refreshedAccounts = await onRefresh();
      if (
        !refreshedAccounts.some((account) => account.providerId === "google")
      ) {
        throw new Error("Google account link was not confirmed");
      }
      posthog.capture("google_account_linked");
      toast.success(t("settings.security.googleConnected"));
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "google account link failed",
        error: parseError(err),
      });
      toast.error(t("common.error"));
    } finally {
      setAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (!googleAccount) {
      return;
    }
    if (isDisconnectBlocked) {
      toast.error(t("settings.security.googleDisconnectBlocked"));
      return;
    }

    setAction("disconnect");
    try {
      const result = await auth.unlinkAccount({
        accountId: googleAccount.id,
      });
      if (result.error) {
        const ufe = getUserFacingError(result.error);
        toast.error(t(ufe.titleKey), {
          description: getUserFacingDescription(ufe, t),
        });
        return;
      }
      posthog.capture("google_account_unlinked");
      toast.success(t("settings.security.googleDisconnected"));
      await onRefresh();
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "google account unlink failed",
        error: parseError(err),
      });
      toast.error(t("common.error"));
    } finally {
      setAction(null);
    }
  };

  return (
    <section
      aria-labelledby="security-google-heading"
      className="space-y-2 py-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Google aria-hidden="true" className="size-5 shrink-0" />
          <div className="min-w-0">
            <h4 className="font-medium text-sm" id="security-google-heading">
              {t("settings.security.googleTitle")}
            </h4>
            <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
              {t("settings.security.googleDescription")}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 lg:shrink-0 lg:flex-row lg:items-center lg:justify-end">
          <Badge variant="secondary">
            <span
              aria-hidden="true"
              className={
                googleAccount
                  ? "size-1.5 rounded-full bg-emerald-500"
                  : "size-1.5 rounded-full bg-muted-foreground/50"
              }
            />
            {googleAccount
              ? t("settings.security.connected")
              : t("settings.security.notConnected")}
          </Badge>
          {googleAccount ? (
            <Button
              aria-busy={action === "disconnect"}
              className="h-11 w-full lg:h-8 lg:w-auto"
              disabled={loading || action !== null || isDisconnectBlocked}
              onClick={handleDisconnect}
              size="sm"
              variant="outline"
            >
              {action === "disconnect"
                ? t("settings.security.disconnecting")
                : t("settings.security.disconnectGoogle")}
            </Button>
          ) : (
            <Button
              aria-busy={action === "connect"}
              className="h-11 w-full lg:h-8 lg:w-auto"
              disabled={loading || action !== null}
              onClick={handleConnect}
              size="sm"
              variant="outline"
            >
              {action === "connect"
                ? t("settings.security.connecting")
                : t("settings.security.connectGoogle")}
            </Button>
          )}
        </div>
      </div>
      {googleAccount && isDisconnectBlocked ? (
        <p className="text-muted-foreground text-xs leading-relaxed lg:pl-8">
          {t("settings.security.googleDisconnectHint")}
        </p>
      ) : null}
    </section>
  );
}

function ActiveSessionsSection() {
  const { i18n, t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { pathWithRegion } = useRegion();
  const { data: currentSession, isPending: sessionPending } = auth.useSession();
  const sessionsQuery = useQuery({
    ...securitySessionsQueryOptions(auth),
    enabled: !sessionPending,
  });
  const sessions = sessionsQuery.data ?? [];
  const sessionsPaused = sessionsQuery.fetchStatus === "paused";
  const needsReauthentication =
    !sessionsPaused && isSessionNotFreshError(sessionsQuery.error);
  const currentToken = currentSession?.session?.token;
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const handleRevoke = async (token: string) => {
    setRevokingId(token);
    try {
      await auth.revokeSession({ token });
      posthog.capture("session_revoked");
      queryClient.setQueryData(
        settingsQueryKeys.securitySessions(),
        (prev: SessionInfo[] | undefined) =>
          (prev ?? []).filter((session) => session.token !== token)
      );
      toast.success(t("settings.security.sessionRevoked"));
    } catch (e) {
      log.error({
        tag: "Security",
        msg: "session revoke failed",
        error: parseError(e),
      });
      toast.error(t("common.error"));
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await auth.revokeOtherSessions();
      posthog.capture("all_sessions_revoked");
      queryClient.setQueryData(
        settingsQueryKeys.securitySessions(),
        (prev: SessionInfo[] | undefined) =>
          (prev ?? []).filter((session) => session.token === currentToken)
      );
      toast.success(t("settings.security.allSessionsRevoked"));
    } catch (e) {
      log.error({
        tag: "Security",
        msg: "revoke all failed",
        error: parseError(e),
      });
      toast.error(t("common.error"));
    } finally {
      setRevokingAll(false);
    }
  };

  const otherSessions = sessions.filter(
    (session) => session.token !== currentToken
  );

  const handleReauthenticate = () => {
    navigate(
      buildAddAccountPath(pathWithRegion("/auth"), location),
      currentSession?.user?.email
        ? { state: { email: currentSession.user.email } }
        : undefined
    );
  };

  if (sessionsPaused || sessionsQuery.isError) {
    return (
      <section
        aria-labelledby="security-active-sessions-heading"
        className="space-y-3"
      >
        <h3
          className="font-medium text-sm"
          id="security-active-sessions-heading"
        >
          {t("settings.security.activeSessions")}
        </h3>
        <div className="space-y-4 rounded-xl border p-4 sm:p-5">
          <p
            className={
              sessionsQuery.isError && !needsReauthentication
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
            role={
              sessionsQuery.isError && !needsReauthentication
                ? "alert"
                : "status"
            }
          >
            {t(
              sessionsPaused
                ? "settings.security.offlineToLoad"
                : needsReauthentication
                  ? "settings.security.reauthenticationRequired"
                  : "settings.security.failedToLoad"
            )}
          </p>
          {needsReauthentication ? (
            <Button
              className="h-11 w-full lg:h-8 lg:w-auto"
              onClick={handleReauthenticate}
              size="sm"
            >
              {t("settings.security.signInAgain")}
            </Button>
          ) : sessionsQuery.isError ? (
            <Button
              className="h-11 w-full lg:h-8 lg:w-auto"
              onClick={() => void sessionsQuery.refetch()}
              size="sm"
              variant="outline"
            >
              {t("common.retry")}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (
    sessionPending ||
    (sessionsQuery.isPending && sessionsQuery.fetchStatus === "fetching")
  ) {
    return (
      <section
        aria-labelledby="security-active-sessions-heading"
        aria-live="polite"
        className="space-y-3"
      >
        <h3
          className="font-medium text-sm"
          id="security-active-sessions-heading"
        >
          {t("settings.security.activeSessions")}
        </h3>
        <div
          aria-label={t("common.loading")}
          className="divide-y rounded-xl border px-4 sm:px-5"
          role="status"
        >
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="security-active-sessions-heading"
      className="space-y-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h3
          className="font-medium text-sm"
          id="security-active-sessions-heading"
        >
          {t("settings.security.activeSessions")}
        </h3>
        {otherSessions.length > 0 ? (
          <Button
            aria-busy={revokingAll}
            className="h-11 w-full lg:h-8 lg:w-auto"
            disabled={revokingAll}
            onClick={handleRevokeAll}
            size="sm"
            variant="destructive"
          >
            {revokingAll
              ? t("settings.security.revoking")
              : t("settings.security.revokeAllOther")}
          </Button>
        ) : null}
      </div>
      <ul className="divide-y rounded-xl border px-4 py-4 sm:px-5">
        {sessions.map((session) => {
          const isCurrent = session.token === currentToken;
          const { browser, os } = session.userAgent
            ? parseUserAgent(session.userAgent)
            : {
                browser: t("settings.security.unknownBrowser"),
                os: t("settings.security.unknownDevice"),
              };
          const lastActive = session.updatedAt
            ? formatRelativeDate(
                new Date(session.updatedAt),
                i18n.resolvedLanguage ?? i18n.language
              )
            : "";
          const sessionDetails = [
            session.ipAddress,
            lastActive
              ? `${t("settings.security.lastActive")} ${lastActive}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between"
              key={session.id}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-4.5 shrink-0 text-muted-foreground"
                  icon={ComputerIcon}
                  strokeWidth={1.8}
                />
                <div className="min-w-0">
                  <p
                    className="truncate font-medium text-sm"
                    id={`session-name-${session.id}`}
                  >
                    {browser} — {os}
                  </p>
                  {sessionDetails ? (
                    <p className="truncate text-muted-foreground text-xs">
                      {sessionDetails}
                    </p>
                  ) : null}
                </div>
              </div>
              {isCurrent ? (
                <Badge
                  className="self-start border-emerald-600/20 bg-emerald-500/10 text-emerald-700 lg:self-auto dark:text-emerald-400"
                  variant="outline"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-emerald-500"
                  />
                  {t("settings.security.thisDevice")}
                </Badge>
              ) : (
                <Button
                  aria-labelledby={`session-revoke-label-${session.id} session-name-${session.id}`}
                  aria-busy={revokingId === session.token}
                  className="h-11 w-full lg:h-8 lg:w-auto"
                  disabled={revokingId === session.token}
                  onClick={() => handleRevoke(session.token)}
                  size="sm"
                  variant="destructive"
                >
                  <span id={`session-revoke-label-${session.id}`}>
                    {revokingId === session.token
                      ? t("settings.security.revoking")
                      : t("settings.security.revokeSession")}
                  </span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SecurityContent() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: session, isPending: sessionPending } = auth.useSession();
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const accountsQuery = useQuery({
    ...securityAccountsQueryOptions(auth),
    enabled: !(sessionPending || isAnonymous),
  });
  const accounts = accountsQuery.data ?? [];
  const accountsPaused = accountsQuery.fetchStatus === "paused";
  const accountsUnavailable = accountsPaused || accountsQuery.isError;
  const accountsLoading =
    !isAnonymous &&
    (sessionPending ||
      (accountsQuery.isPending && accountsQuery.fetchStatus === "fetching"));
  const passkeysSupported = authSupportsPasskeys(auth);

  const hasPassword = accounts.some(
    (account) => account.providerId === "credential"
  );

  const refreshAccounts = async () => {
    const result = await accountsQuery.refetch();
    if (result.isError) {
      throw result.error;
    }
    return result.data ?? [];
  };

  return (
    <div className="space-y-8" data-testid="settings-panel-security">
      {isAnonymous ? (
        <p className="py-2 text-muted-foreground text-sm">
          {t("settings.security.anonymousNote")}
        </p>
      ) : (
        <>
          <section
            aria-labelledby="security-sign-in-methods-heading"
            className="space-y-3"
          >
            <h3
              className="font-medium text-sm"
              id="security-sign-in-methods-heading"
            >
              {t("settings.security.signInMethods")}
            </h3>
            <div className="divide-y overflow-hidden rounded-xl border px-4 sm:px-5">
              {accountsUnavailable ? (
                <div className="space-y-4 py-5">
                  <p
                    className={
                      accountsQuery.isError
                        ? "text-destructive text-sm"
                        : "text-muted-foreground text-sm"
                    }
                    role={accountsQuery.isError ? "alert" : "status"}
                  >
                    {t(
                      accountsPaused
                        ? "settings.security.offlineToLoad"
                        : "settings.security.failedToLoadAccounts"
                    )}
                  </p>
                  {accountsQuery.isError ? (
                    <Button
                      className="h-11 w-full lg:h-8 lg:w-auto"
                      onClick={() => void accountsQuery.refetch()}
                      size="sm"
                      variant="outline"
                    >
                      {t("common.retry")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {accountsUnavailable ? null : accountsLoading ? (
                <div
                  aria-label={t("common.loading")}
                  className="divide-y"
                  role="status"
                >
                  <div className="space-y-2 py-5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                  </div>
                  <div className="space-y-2 py-5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {hasPassword ? (
                    <PasswordSection hasPassword />
                  ) : (
                    <PasswordSection
                      hasPassword={false}
                      onPasswordSet={() => void refreshAccounts()}
                    />
                  )}
                  {hasPassword || passkeysSupported ? (
                    <div
                      className="divide-y"
                      data-testid="settings-security-authentication-card"
                    >
                      {hasPassword ? (
                        <TwoFactorSection
                          enabled={Boolean(session?.user?.twoFactorEnabled)}
                        />
                      ) : null}
                      {passkeysSupported ? <PasskeySection /> : null}
                    </div>
                  ) : null}
                  <GoogleAccountSection
                    accounts={accounts}
                    loading={accountsLoading}
                    onRefresh={refreshAccounts}
                  />
                </div>
              )}
            </div>
          </section>
          <ActiveSessionsSection />
        </>
      )}
    </div>
  );
}
