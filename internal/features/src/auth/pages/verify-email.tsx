import { Button } from "@lunarisapp/ui/components/button";
import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { useRegion } from "../../region";
import { AuthLayout } from "../components/auth-layout";
import { useAuth } from "../context";
import {
  createAccountSwitchNavigationState,
  useAuthRedirect,
} from "../redirect";

const COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { authUrl, pathWithRegion, selectionRequired } = useRegion();
  const { isAddingAccount, resolvedRedirectTo, urlWithRedirect } =
    useAuthRedirect();
  const { data: session, isPending, refetch } = auth.useSession();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);
  const sessionCheckStartedRef = useRef(false);

  useEffect(() => {
    if (isPending || session || sessionCheckStartedRef.current) {
      return;
    }

    sessionCheckStartedRef.current = true;
    refetch().then(
      () => setSessionCheckComplete(true),
      () => setSessionCheckComplete(true)
    );
  }, [isPending, refetch, session]);

  const sendEmail = useCallback(async () => {
    const email = session?.user?.email;
    if (!email || sending) {
      return;
    }
    setSending(true);
    try {
      await auth.sendVerificationEmail({
        email,
        callbackURL: urlWithRedirect(authUrl("/")),
      });
      setCooldown(COOLDOWN_SECONDS);
      posthog.capture("verification_email_sent");
      return true;
    } catch {
      toast.error(t("auth.verificationFailed"));
      return false;
    } finally {
      setSending(false);
    }
  }, [session?.user?.email, sending, t, auth, authUrl, urlWithRedirect]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0) {
      return;
    }
    const sent = await sendEmail();
    if (sent) {
      toast.success(t("auth.verificationSent"));
      posthog.capture("verification_email_resent");
    }
  }, [cooldown, sendEmail, t]);

  if (isPending || !(session || sessionCheckComplete)) {
    return null;
  }

  if (selectionRequired) {
    return <Navigate replace to={pathWithRegion("/auth")} />;
  }

  if (!session) {
    return <Navigate replace to={pathWithRegion("/auth")} />;
  }

  if (session.user.emailVerified) {
    return (
      <Navigate
        replace
        state={createAccountSwitchNavigationState(
          session.user.id,
          isAddingAccount
        )}
        to={resolvedRedirectTo}
      />
    );
  }

  const email = session.user.email;
  const isDisabled = cooldown > 0 || sending;

  return (
    <AuthLayout
      description={t("auth.verifyEmailDescription", { email })}
      title={t("auth.verifyEmail")}
    >
      <div
        className="flex flex-col items-center gap-4"
        data-testid="auth-verify-page"
      >
        <Button
          className="w-full"
          data-testid="auth-verify-resend"
          disabled={isDisabled}
          onClick={handleResend}
          variant="outline"
        >
          {cooldown > 0
            ? t("auth.resendCooldown", { seconds: cooldown })
            : t("auth.resendVerification")}
        </Button>
      </div>
    </AuthLayout>
  );
}
