"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { Checkbox } from "@lunarisapp/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lunarisapp/ui/components/dialog";
import { Input } from "@lunarisapp/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@lunarisapp/ui/components/input-otp";
import { Label } from "@lunarisapp/ui/components/label";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { usePlatform } from "@repo/platform";
import { captureExceptionSafe } from "@repo/utils/posthog";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { useAuth } from "../../auth";

interface TwoFactorSetup {
  backupCodes: string[];
  totpURI: string;
}

type SetupStep = "password" | "authenticator" | "recovery";

const SETUP_STEPS: SetupStep[] = ["password", "authenticator", "recovery"];

function getTotpSecret(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-destructive text-sm" role="alert">
      {error}
    </p>
  );
}

function BackupCodes({
  acknowledged,
  codes,
  onAcknowledgedChange,
}: {
  acknowledged: boolean;
  codes: string[];
  onAcknowledgedChange: (acknowledged: boolean) => void;
}) {
  const { t } = useTranslation();
  const { clipboard } = usePlatform();

  const copyCodes = async () => {
    try {
      await clipboard.writeText(codes.join("\n"));
      toast.success(t("settings.security.backupCodesCopied"));
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "backup codes copy failed",
        error: parseError(err),
      });
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="space-y-4">
      <ul
        aria-label={t("settings.security.backupCodesTitle")}
        className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/40 p-4 font-mono text-xs"
        data-testid="two-factor-backup-codes"
      >
        {codes.map((code) => (
          <li className="select-all" key={code}>
            {code}
          </li>
        ))}
      </ul>
      <Button onClick={copyCodes} size="sm" type="button" variant="outline">
        {t("settings.security.copyBackupCodes")}
      </Button>
      <Label
        className="flex items-start gap-2 font-normal"
        htmlFor="two-factor-backup-codes-saved"
      >
        <Checkbox
          checked={acknowledged}
          data-testid="two-factor-backup-codes-saved"
          id="two-factor-backup-codes-saved"
          onCheckedChange={onAcknowledgedChange}
        />
        <span>{t("settings.security.savedBackupCodes")}</span>
      </Label>
    </div>
  );
}

function SetupProgress({ step }: { step: SetupStep }) {
  const { t } = useTranslation();
  const activeIndex = SETUP_STEPS.indexOf(step);
  const labels = {
    password: t("settings.security.twoFactorStepPassword"),
    authenticator: t("settings.security.twoFactorStepAuthenticator"),
    recovery: t("settings.security.twoFactorStepRecovery"),
  };

  return (
    <ol
      aria-label={t("settings.security.twoFactorTitle")}
      className="grid grid-cols-3 gap-2"
    >
      {SETUP_STEPS.map((item, index) => {
        const active = index === activeIndex;
        const complete = index < activeIndex;
        return (
          <li
            aria-current={active ? "step" : undefined}
            className="min-w-0 space-y-1.5"
            key={item}
          >
            <div
              aria-hidden="true"
              className={`h-1 rounded-full transition-colors ${
                active || complete ? "bg-primary" : "bg-muted"
              }`}
            />
            <span
              className={`block truncate text-xs ${
                active ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              {index + 1}. {labels[item]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TwoFactorSetupDialog({
  onEnabled,
  onOpenChange,
  open,
}: {
  onEnabled: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const { clipboard } = usePlatform();
  const auth = useAuth();
  const [step, setStep] = useState<SetupStep>("password");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"enable" | "verify" | "cleanup" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("password");
    setPassword("");
    setSetup(null);
    setCode("");
    setAcknowledged(false);
    setError(null);
  };

  const setUserFacingError = (err: unknown) => {
    setError(getUserFacingDescription(getUserFacingError(err), t));
  };

  const cleanupAndClose = async () => {
    setBusy("cleanup");
    try {
      const result = await auth.twoFactor.disable(
        { password },
        { disableSignal: true },
      );
      if (result.error) {
        log.warn({
          tag: "Security",
          msg: "incomplete two factor setup cleanup failed",
          error: result.error,
        });
      }
    } catch (err) {
      log.warn({
        tag: "Security",
        msg: "incomplete two factor setup cleanup failed",
        error: parseError(err),
      });
    } finally {
      setBusy(null);
      reset();
      onOpenChange(false);
    }
  };

  const completeEnrollment = () => {
    if (!acknowledged) return;
    toast.success(t("settings.security.twoFactorEnabledToast"));
    reset();
    onOpenChange(false);
    onEnabled();
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (busy || (step === "recovery" && !acknowledged)) return;
    if (step === "recovery") {
      completeEnrollment();
      return;
    }
    if (setup && step === "authenticator") {
      void cleanupAndClose();
      return;
    }
    reset();
    onOpenChange(false);
  };

  const handleEnable = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy("enable");
    setError(null);
    try {
      const result = await auth.twoFactor.enable(
        { password },
        { disableSignal: true },
      );
      if (result.error) {
        posthog.capture("two_factor_setup_failed", { step: "enable" });
        setUserFacingError(result.error);
        return;
      }
      if (
        !result.data ||
        !("totpURI" in result.data) ||
        typeof result.data.totpURI !== "string" ||
        !("backupCodes" in result.data) ||
        !Array.isArray(result.data.backupCodes)
      ) {
        throw new Error("2FA setup response was incomplete");
      }
      setSetup({
        backupCodes: result.data.backupCodes,
        totpURI: result.data.totpURI,
      });
      setStep("authenticator");
      posthog.capture("two_factor_setup_started");
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "two factor setup failed",
        error: parseError(err),
      });
      captureExceptionSafe(err);
      setUserFacingError(err);
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6 || busy || !setup) return;
    setBusy("verify");
    setError(null);
    try {
      const result = await auth.twoFactor.verifyTotp(
        { code },
        { disableSignal: true },
      );
      if (result.error) {
        posthog.capture("two_factor_setup_failed", { step: "verify" });
        setUserFacingError(result.error);
        return;
      }
      setStep("recovery");
      posthog.capture("two_factor_enabled");
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "two factor verification failed",
        error: parseError(err),
      });
      captureExceptionSafe(err);
      setUserFacingError(err);
    } finally {
      setBusy(null);
    }
  };

  const copySetupKey = async (secret: string) => {
    try {
      await clipboard.writeText(secret);
      toast.success(t("settings.security.setupKeyCopied"));
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "two factor setup key copy failed",
        error: parseError(err),
      });
      toast.error(t("common.error"));
    }
  };

  const description =
    step === "password"
      ? t("settings.security.twoFactorPasswordDescription")
      : step === "authenticator"
        ? t("settings.security.twoFactorAuthenticatorDescription")
        : t("settings.security.backupCodesDescription");
  const title =
    step === "password"
      ? t("settings.security.setUpTwoFactor")
      : step === "authenticator"
        ? t("settings.security.twoFactorAuthenticatorTitle")
        : t("settings.security.backupCodesTitle");
  const secret = setup ? getTotpSecret(setup.totpURI) : "";

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogContent
        className={`flex max-h-[85dvh] flex-col overflow-hidden p-0 ${
          step === "authenticator" ? "sm:max-w-2xl" : "sm:max-w-xl"
        }`}
        data-testid="two-factor-setup-dialog"
        showCloseButton={
          busy === null && (step !== "recovery" || acknowledged)
        }
      >
        <DialogHeader className="shrink-0 border-b px-4 pt-4 pb-3 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <SetupProgress step={step} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-1">
          {step === "password" ? (
            <form
              className="space-y-3 py-3"
              id="two-factor-enable-form"
              onSubmit={handleEnable}
            >
              <div className="space-y-2">
                <Label htmlFor="two-factor-enable-password">
                  {t("settings.security.currentPassword")}
                </Label>
                <Input
                  autoComplete="current-password"
                  autoFocus
                  data-testid="two-factor-enable-password"
                  disabled={busy !== null}
                  id="two-factor-enable-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </div>
              <ErrorMessage error={error} />
            </form>
          ) : null}

          {step === "authenticator" && setup ? (
            <form
              className="space-y-6 px-2 py-4 sm:px-4"
              id="two-factor-verify-form"
              onSubmit={handleVerify}
            >
              <section
                aria-labelledby="two-factor-scan-heading"
                className="space-y-3"
              >
                <div className="space-y-1">
                  <h3
                    className="text-sm font-medium"
                    id="two-factor-scan-heading"
                  >
                    {t("settings.security.twoFactorScanQrTitle")}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t("settings.security.twoFactorScanQrDescription")}
                  </p>
                </div>

                <div className="bg-muted/50 grid min-w-0 max-w-full gap-4 overflow-hidden rounded-xl p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                  <div
                    aria-label={t("settings.security.twoFactorQrLabel")}
                    className="mx-auto w-fit rounded-lg bg-white p-3 sm:mx-0"
                    role="img"
                  >
                    <QRCode
                      aria-hidden="true"
                      bgColor="#ffffff"
                      fgColor="#18181b"
                      size={168}
                      value={setup.totpURI}
                    />
                  </div>

                  {secret ? (
                    <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {t("settings.security.twoFactorManualSetupTitle")}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {t("settings.security.twoFactorSecretLabel")}
                        </p>
                      </div>
                      <pre
                        aria-label={t(
                          "settings.security.twoFactorSecretLabel",
                        )}
                        className="w-full min-w-0 overflow-x-auto whitespace-pre rounded-md border bg-background px-3 py-2 font-mono text-xs select-all"
                        data-testid="two-factor-secret"
                        tabIndex={0}
                      >
                        {secret}
                      </pre>
                      <Button
                        disabled={busy !== null}
                        onClick={() => void copySetupKey(secret)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {t("settings.security.copySetupKey")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                aria-labelledby="two-factor-verification-heading"
                className="space-y-3"
              >
                <div className="space-y-1">
                  <h3
                    className="text-sm font-medium"
                    id="two-factor-verification-heading"
                  >
                    {t("settings.security.twoFactorVerificationTitle")}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t("settings.security.twoFactorVerificationDescription")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="two-factor-setup-code">
                    {t("settings.security.authenticatorCode")}
                  </Label>
                  <InputOTP
                    aria-describedby={error ? "two-factor-setup-error" : undefined}
                    aria-invalid={Boolean(error)}
                    autoComplete="one-time-code"
                    autoFocus
                    data-testid="two-factor-setup-code"
                    disabled={busy !== null}
                    id="two-factor-setup-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(value) =>
                      setCode(value.replace(/\D/g, "").slice(0, 6))
                    }
                    pattern="[0-9]*"
                    value={code}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }, (_, index) => (
                        <InputOTPSlot
                          className="size-9 sm:size-10"
                          index={index}
                          key={index}
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error ? (
                  <p
                    className="text-destructive text-sm"
                    id="two-factor-setup-error"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
              </section>
            </form>
          ) : null}

          {step === "recovery" && setup ? (
            <div className="py-3">
              <BackupCodes
                acknowledged={acknowledged}
                codes={setup.backupCodes}
                onAcknowledgedChange={setAcknowledged}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="m-0 shrink-0 rounded-none px-4">
          {step !== "recovery" ? (
            <Button
              disabled={busy !== null}
              onClick={() => requestOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
          ) : null}
          {step === "password" ? (
            <Button
              disabled={!password || busy !== null}
              form="two-factor-enable-form"
              type="submit"
            >
              {busy === "enable"
                ? t("settings.security.settingUpTwoFactor")
                : t("common.continue")}
            </Button>
          ) : null}
          {step === "authenticator" ? (
            <Button
              disabled={code.length !== 6 || busy !== null}
              form="two-factor-verify-form"
              type="submit"
            >
              {busy === "verify"
                ? t("settings.security.verifying")
                : t("settings.security.verifyAndEnable")}
            </Button>
          ) : null}
          {step === "recovery" ? (
            <Button
              disabled={!acknowledged}
              onClick={completeEnrollment}
              type="button"
            >
              {t("common.done")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegenerateBackupCodesDialog({
  onRegenerated,
  onOpenChange,
  open,
}: {
  onRegenerated: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setCodes(null);
    setAcknowledged(false);
    setError(null);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (busy || (codes && !acknowledged)) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await auth.twoFactor.generateBackupCodes({ password });
      if (result.error) {
        posthog.capture("two_factor_management_failed", {
          action: "regenerate_backup_codes",
        });
        setError(getUserFacingDescription(getUserFacingError(result.error), t));
        return;
      }
      if (!Array.isArray(result.data?.backupCodes)) {
        throw new Error("Backup code response was incomplete");
      }
      setCodes(result.data.backupCodes);
      posthog.capture("two_factor_backup_codes_regenerated");
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "two factor backup code regeneration failed",
        error: parseError(err),
      });
      captureExceptionSafe(err);
      setError(getUserFacingDescription(getUserFacingError(err), t));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!acknowledged) return;
    toast.success(t("settings.security.backupCodesRegenerated"));
    reset();
    onRegenerated();
  };

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[85dvh] flex-col overflow-hidden p-0 sm:max-w-xl"
        data-testid="two-factor-regenerate-dialog"
        showCloseButton={!busy && !codes}
      >
        <DialogHeader className="shrink-0 border-b px-4 pt-4 pb-3 pr-12">
          <DialogTitle>
            {codes
              ? t("settings.security.backupCodesTitle")
              : t("settings.security.regenerateBackupCodes")}
          </DialogTitle>
          <DialogDescription>
            {codes
              ? t("settings.security.backupCodesDescription")
              : t("settings.security.regenerateBackupCodesDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
          {codes ? (
            <div className="py-3">
              <BackupCodes
                acknowledged={acknowledged}
                codes={codes}
                onAcknowledgedChange={setAcknowledged}
              />
            </div>
          ) : (
            <form
              className="space-y-3 py-3"
              id="two-factor-regenerate-form"
              onSubmit={handleSubmit}
            >
              <div className="space-y-2">
                <Label htmlFor="two-factor-regenerate-password">
                  {t("settings.security.currentPassword")}
                </Label>
                <Input
                  autoComplete="current-password"
                  autoFocus
                  data-testid="two-factor-regenerate-password"
                  disabled={busy}
                  id="two-factor-regenerate-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </div>
              <ErrorMessage error={error} />
            </form>
          )}
        </div>
        <DialogFooter className="m-0 shrink-0 rounded-none px-4">
          {!codes ? (
            <Button
              disabled={busy}
              onClick={() => requestOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
          ) : null}
          {codes ? (
            <Button disabled={!acknowledged} onClick={finish} type="button">
              {t("common.done")}
            </Button>
          ) : (
            <Button
              disabled={!password || busy}
              form="two-factor-regenerate-form"
              type="submit"
            >
              {busy
                ? t("settings.security.regeneratingBackupCodes")
                : t("settings.security.regenerateBackupCodes")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisableTwoFactorDialog({
  onDisabled,
  onOpenChange,
  open,
}: {
  onDisabled: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setError(null);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await auth.twoFactor.disable({ password });
      if (result.error) {
        posthog.capture("two_factor_management_failed", { action: "disable" });
        setError(getUserFacingDescription(getUserFacingError(result.error), t));
        return;
      }
      posthog.capture("two_factor_disabled");
      toast.success(t("settings.security.twoFactorDisabledToast"));
      reset();
      onDisabled();
      onOpenChange(false);
    } catch (err) {
      log.error({
        tag: "Security",
        msg: "two factor disable failed",
        error: parseError(err),
      });
      captureExceptionSafe(err);
      setError(getUserFacingDescription(getUserFacingError(err), t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-xl"
        data-testid="two-factor-disable-dialog"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.security.disableTwoFactor")}</DialogTitle>
          <DialogDescription>
            {t("settings.security.disableTwoFactorDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <form
            className="space-y-3"
            id="two-factor-disable-form"
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <Label htmlFor="two-factor-disable-password">
                {t("settings.security.currentPassword")}
              </Label>
              <Input
                autoComplete="current-password"
                autoFocus
                data-testid="two-factor-disable-password"
                disabled={busy}
                id="two-factor-disable-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </div>
            <ErrorMessage error={error} />
          </form>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => requestOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!password || busy}
            form="two-factor-disable-form"
            type="submit"
            variant="destructive"
          >
            {busy
              ? t("settings.security.disablingTwoFactor")
              : t("settings.security.disableTwoFactor")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
