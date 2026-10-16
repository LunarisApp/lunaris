"use client";

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
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../../auth";

function ErrorMessage({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
  return (
    <p className="text-destructive text-sm" role="alert">
      {error}
    </p>
  );
}

function NewPasswordFields({
  autoFocusNewPassword = false,
  confirmPassword,
  disabled,
  idPrefix,
  mismatch,
  newPassword,
  onConfirmPasswordChange,
  onNewPasswordChange,
}: {
  autoFocusNewPassword?: boolean;
  confirmPassword: string;
  disabled: boolean;
  idPrefix: string;
  mismatch: boolean;
  newPassword: string;
  onConfirmPasswordChange: (password: string) => void;
  onNewPasswordChange: (password: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-new-password`}>
          {t("settings.security.newPassword")}
        </Label>
        <Input
          autoComplete="new-password"
          autoFocus={autoFocusNewPassword}
          data-testid={`settings-security-${idPrefix}-new-password`}
          disabled={disabled}
          id={`${idPrefix}-new-password`}
          onChange={(event) => onNewPasswordChange(event.target.value)}
          type="password"
          value={newPassword}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-confirm-password`}>
          {t("settings.security.confirmPassword")}
        </Label>
        <Input
          aria-describedby={
            mismatch ? `${idPrefix}-confirm-password-error` : undefined
          }
          aria-invalid={mismatch}
          autoComplete="new-password"
          data-testid={`settings-security-${idPrefix}-confirm-password`}
          disabled={disabled}
          id={`${idPrefix}-confirm-password`}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          type="password"
          value={confirmPassword}
        />
        {mismatch ? (
          <p
            className="text-destructive text-xs"
            data-testid="settings-security-password-mismatch"
            id={`${idPrefix}-confirm-password-error`}
            role="alert"
          >
            {t("settings.security.passwordMismatch")}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function ChangePasswordDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirmPassword !== "" && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword !== "" &&
    newPassword !== "" &&
    confirmPassword !== "" &&
    !mismatch &&
    !saving;

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (saving) {
      return;
    }
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await auth.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        setError(getUserFacingDescription(getUserFacingError(result.error), t));
        return;
      }
      posthog.capture("password_changed");
      toast.success(t("settings.security.passwordChanged"));
      reset();
      onOpenChange(false);
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "password change failed",
        error: parseError(err),
      });
      setError(getUserFacingDescription(getUserFacingError(err), t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="change-password-dialog"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.security.changePassword")}</DialogTitle>
          <DialogDescription>
            {t("settings.security.changePasswordDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          id="change-password-form"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor="change-current-password">
              {t("settings.security.currentPassword")}
            </Label>
            <Input
              autoComplete="current-password"
              autoFocus
              data-testid="settings-security-current-password"
              disabled={saving}
              id="change-current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </div>
          <NewPasswordFields
            confirmPassword={confirmPassword}
            disabled={saving}
            idPrefix="change"
            mismatch={mismatch}
            newPassword={newPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onNewPasswordChange={setNewPassword}
          />
          <ErrorMessage error={error} />
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
          <Button
            data-testid="settings-security-change-password-submit"
            disabled={!canSubmit}
            form="change-password-form"
            type="submit"
          >
            {saving
              ? t("settings.security.saving")
              : t("settings.security.changePassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SetPasswordDialog({
  onOpenChange,
  onPasswordSet,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onPasswordSet: () => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirmPassword !== "" && newPassword !== confirmPassword;
  const canSubmit =
    newPassword !== "" && confirmPassword !== "" && !mismatch && !saving;

  const reset = () => {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (saving) {
      return;
    }
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = (await auth.$fetch("/set-password", {
        method: "POST",
        body: { newPassword },
      })) as { error?: unknown };
      if (result.error) {
        setError(getUserFacingDescription(getUserFacingError(result.error), t));
        return;
      }
      posthog.capture("password_set");
      toast.success(t("settings.security.passwordSet"));
      reset();
      onOpenChange(false);
      onPasswordSet();
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "set password failed",
        error: parseError(err),
      });
      setError(getUserFacingDescription(getUserFacingError(err), t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="set-password-dialog"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.security.setPassword")}</DialogTitle>
          <DialogDescription>
            {t("settings.security.setPasswordDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          id="set-password-form"
          onSubmit={handleSubmit}
        >
          <NewPasswordFields
            autoFocusNewPassword
            confirmPassword={confirmPassword}
            disabled={saving}
            idPrefix="set"
            mismatch={mismatch}
            newPassword={newPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onNewPasswordChange={setNewPassword}
          />
          <ErrorMessage error={error} />
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
          <Button
            data-testid="settings-security-set-password-submit"
            disabled={!canSubmit}
            form="set-password-form"
            type="submit"
          >
            {saving
              ? t("settings.security.saving")
              : t("settings.security.setPassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
