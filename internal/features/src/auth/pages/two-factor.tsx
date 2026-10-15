import { Button } from "@lunarisapp/ui/components/button";
import { Checkbox } from "@lunarisapp/ui/components/checkbox";
import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import { captureExceptionSafe } from "@repo/utils/posthog";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { AuthBackLink } from "../components/auth-back-link";
import { AuthLayout } from "../components/auth-layout";
import { useAuth } from "../context";
import { getAuthErrorDescription } from "../errors";
import {
  createAccountSwitchNavigationState,
  useAuthRedirect,
} from "../redirect";

type VerificationMethod = "totp" | "backup";

export default function TwoFactorPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const { data: session } = auth.useSession();
  const {
    isAddingAccount,
    pathWithRedirect,
    resolvedRedirectTo,
  } = useAuthRedirect();
  const [method, setMethod] = useState<VerificationMethod>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session && !isAddingAccount) {
    return <Navigate replace to={resolvedRedirectTo} />;
  }

  const switchMethod = () => {
    setMethod((current) => (current === "totp" ? "backup" : "totp"));
    setCode("");
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result =
        method === "totp"
          ? await auth.twoFactor.verifyTotp({ code, trustDevice })
          : await auth.twoFactor.verifyBackupCode({
              code,
              disableSession: false,
              trustDevice,
            });
      if (result.error) {
        setError(getAuthErrorDescription(result.error, t));
        posthog.capture("auth_two_factor_failed", { method });
        return;
      }
      posthog.capture("auth_two_factor_verified", {
        method,
        trust_device: trustDevice,
      });
      posthog.capture("auth_sign_in", { method: "email" });
      navigate(resolvedRedirectTo, {
        replace: true,
        state: createAccountSwitchNavigationState(
          result.data?.user?.id,
          isAddingAccount,
        ),
      });
    } catch (err) {
      log.error({
        tag: "Auth",
        msg: "two factor sign in failed",
        error: parseError(err),
      });
      captureExceptionSafe(err);
      setError(getAuthErrorDescription(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const isTotp = method === "totp";
  const validCode = isTotp ? code.length === 6 : code.trim().length > 0;

  return (
    <AuthLayout
      description={
        isTotp
          ? t("auth.twoFactorDescription")
          : t("auth.backupCodeDescription")
      }
      leading={
        <AuthBackLink
          label={t("auth.backToSignIn")}
          to={pathWithRedirect("/auth/email")}
        />
      }
      title={t("auth.twoFactorTitle")}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="two-factor-code">
            {isTotp ? t("auth.authenticatorCode") : t("auth.backupCode")}
          </Label>
          <Input
            aria-describedby={error ? "two-factor-code-error" : undefined}
            aria-invalid={Boolean(error)}
            autoComplete="one-time-code"
            autoFocus
            data-testid="auth-two-factor-code"
            id="two-factor-code"
            inputMode={isTotp ? "numeric" : "text"}
            maxLength={isTotp ? 6 : 64}
            onChange={(event) =>
              setCode(
                isTotp
                  ? event.target.value.replace(/\D/g, "").slice(0, 6)
                  : event.target.value.trim(),
              )
            }
            pattern={isTotp ? "[0-9]*" : undefined}
            placeholder={isTotp ? "000000" : undefined}
            value={code}
          />
          {error ? (
            <p
              className="text-destructive text-sm"
              id="two-factor-code-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
        <Label className="flex items-start gap-2 font-normal">
          <Checkbox checked={trustDevice} onCheckedChange={setTrustDevice} />
          <span>{t("auth.trustDevice")}</span>
        </Label>
        <Button
          className="h-11 w-full"
          data-testid="auth-two-factor-submit"
          disabled={!validCode || submitting}
          type="submit"
        >
          {submitting ? t("auth.verifying") : t("auth.verify")}
        </Button>
      </form>
      <Button
        className="mt-3 w-full"
        data-testid="auth-two-factor-switch-method"
        onClick={switchMethod}
        type="button"
        variant="ghost"
      >
        {isTotp ? t("auth.useBackupCode") : t("auth.useAuthenticatorCode")}
      </Button>
    </AuthLayout>
  );
}
