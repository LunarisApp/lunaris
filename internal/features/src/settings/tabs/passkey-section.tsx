"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lunarisapp/ui/components/alert-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lunarisapp/ui/components/dialog";
import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../../auth";
import {
  getPasskeyErrorCode,
  isPasskeyCancellation,
} from "../../auth/passkey";
import {
  type PasskeyInfo,
  securityPasskeysQueryOptions,
  settingsQueryKeys,
} from "../queries";

const MAX_PASSKEY_NAME_LENGTH = 64;

function formatPasskeyDate(
  value: Date | string | null | undefined,
  locale?: string,
) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function AddPasskeyDialog({
  onAdded,
  onOpenChange,
  open,
}: {
  onAdded: (passkey: PasskeyInfo) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length > 0 &&
    trimmedName.length <= MAX_PASSKEY_NAME_LENGTH &&
    !saving;

  const reset = () => {
    setName("");
    setError(null);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (saving) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    posthog.capture("passkey_registration_started");
    try {
      const result = (await auth.passkey.addPasskey({
        name: trimmedName,
      })) as { data?: PasskeyInfo; error?: unknown };

      if (result.error) {
        if (isPasskeyCancellation(result.error)) return;
        posthog.capture("passkey_registration_failed", {
          code: getPasskeyErrorCode(result.error) ?? "unknown",
        });
        setError(
          getUserFacingDescription(getUserFacingError(result.error), t),
        );
        return;
      }
      if (!result.data) throw new Error("Passkey registration returned no data");

      posthog.capture("passkey_added");
      toast.success(t("settings.security.passkeyAdded"));
      onAdded(result.data);
      reset();
      onOpenChange(false);
    } catch (caught) {
      if (isPasskeyCancellation(caught)) return;
      log.error({
        tag: "Security",
        msg: "passkey registration failed",
        error: parseError(caught),
      });
      posthog.capture("passkey_registration_failed", { code: "exception" });
      setError(getUserFacingDescription(getUserFacingError(caught), t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="passkey-add-dialog"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.security.addPasskey")}</DialogTitle>
          <DialogDescription>
            {t("settings.security.addPasskeyDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          id="add-passkey-form"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor="passkey-name">
              {t("settings.security.passkeyName")}
            </Label>
            <Input
              aria-describedby="passkey-name-hint"
              aria-invalid={trimmedName.length > MAX_PASSKEY_NAME_LENGTH}
              autoComplete="off"
              autoFocus
              data-testid="settings-security-passkey-name"
              disabled={saving}
              id="passkey-name"
              onChange={(event) => setName(event.target.value)}
              placeholder={t("settings.security.passkeyNamePlaceholder")}
              value={name}
            />
            <p
              className="text-muted-foreground text-xs"
              id="passkey-name-hint"
            >
              {t("settings.security.passkeyNameHint")}
            </p>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={() => requestOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} form="add-passkey-form" type="submit">
            {saving
              ? t("settings.security.addingPasskey")
              : t("settings.security.addPasskey")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PasskeySection() {
  const { i18n, t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PasskeyInfo | null>(null);
  const [removing, setRemoving] = useState(false);
  const passkeysQuery = useQuery(securityPasskeysQueryOptions(auth));
  const passkeys = passkeysQuery.data ?? [];
  const canRegister =
    typeof window !== "undefined" && "PublicKeyCredential" in window;

  const handleAdded = (passkey: PasskeyInfo) => {
    queryClient.setQueryData<PasskeyInfo[]>(
      settingsQueryKeys.securityPasskeys(),
      (current = []) => [...current, passkey],
    );
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result = (await auth.passkey.deletePasskey({
        id: removeTarget.id,
      })) as { error?: unknown };
      if (result.error) throw result.error;

      queryClient.setQueryData<PasskeyInfo[]>(
        settingsQueryKeys.securityPasskeys(),
        (current = []) => current.filter((item) => item.id !== removeTarget.id),
      );
      posthog.capture("passkey_removed");
      toast.success(t("settings.security.passkeyRemoved"));
      setRemoveTarget(null);
    } catch (error) {
      log.error({
        tag: "Security",
        msg: "passkey removal failed",
        error: parseError(error),
      });
      posthog.capture("passkey_removal_failed");
      const userFacing = getUserFacingError(error);
      toast.error(t(userFacing.titleKey), {
        description: getUserFacingDescription(userFacing, t),
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section
      aria-labelledby="security-passkeys-heading"
      className="space-y-4 py-5"
      data-testid="settings-security-passkeys"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-medium" id="security-passkeys-heading">
            {t("settings.security.passkeysTitle")}
          </h4>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {t("settings.security.passkeysDescription")}
          </p>
        </div>
        <Button
          className="h-11 w-full shrink-0 active:scale-[0.98] lg:h-8 lg:w-auto"
          disabled={!canRegister || passkeysQuery.isPending}
          onClick={() => setAddOpen(true)}
          size="sm"
          type="button"
        >
          {t("settings.security.addPasskey")}
        </Button>
      </div>

      {!canRegister ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("settings.security.passkeysUnsupported")}
        </p>
      ) : null}

      {passkeysQuery.fetchStatus === "paused" ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("settings.security.offlineToLoad")}
        </p>
      ) : null}

      {passkeysQuery.isPending && passkeysQuery.fetchStatus === "fetching" ? (
        <div
          aria-label={t("common.loading")}
          className="space-y-2"
          data-testid="passkeys-loading"
          role="status"
        >
          <Skeleton aria-hidden="true" className="h-16 w-full rounded-lg" />
          <Skeleton aria-hidden="true" className="h-16 w-full rounded-lg" />
        </div>
      ) : null}

      {passkeysQuery.isError && passkeysQuery.fetchStatus !== "paused" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-destructive text-sm" role="alert">
            {t("settings.security.passkeysLoadFailed")}
          </p>
          <Button
            onClick={() => void passkeysQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      {passkeysQuery.isSuccess && passkeys.length === 0 ? (
        <p className="text-muted-foreground py-1 text-sm">
          {t("settings.security.noPasskeys")}
        </p>
      ) : null}

      {passkeys.length > 0 ? (
        <ul className="divide-y">
          {passkeys.map((passkey) => {
            const createdAt = formatPasskeyDate(
              passkey.createdAt,
              i18n?.language,
            );
            return (
              <li
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                data-testid="settings-security-passkey-row"
                key={passkey.id}
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    id={`passkey-name-${passkey.id}`}
                  >
                    {passkey.name?.trim() ||
                      t("settings.security.unnamedPasskey")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t(
                      passkey.deviceType === "multiDevice"
                        ? "settings.security.syncedPasskey"
                        : "settings.security.deviceBoundPasskey",
                    )}
                    {createdAt ? ` · ${createdAt}` : ""}
                  </p>
                </div>
                <Button
                  aria-labelledby={`passkey-remove-label-${passkey.id} passkey-name-${passkey.id}`}
                  className="w-full active:scale-[0.98] sm:w-auto"
                  onClick={() => setRemoveTarget(passkey)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <span id={`passkey-remove-label-${passkey.id}`}>
                    {t("settings.security.removePasskey")}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <AddPasskeyDialog
        onAdded={handleAdded}
        onOpenChange={setAddOpen}
        open={addOpen}
      />

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !removing) setRemoveTarget(null);
        }}
        open={removeTarget !== null}
      >
        <AlertDialogContent data-testid="passkey-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.security.removePasskeyTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.security.removePasskeyDescription", {
                name:
                  removeTarget?.name?.trim() ||
                  t("settings.security.unnamedPasskey"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void handleRemove();
              }}
              variant="destructive"
            >
              {removing
                ? t("settings.security.removingPasskey")
                : t("settings.security.removePasskey")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
