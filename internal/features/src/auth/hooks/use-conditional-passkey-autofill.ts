import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../context";
import { isPasskeyCancellation } from "../passkey";
import { createAccountSwitchNavigationState } from "../redirect";

interface ConditionalPasskeyAutofillOptions {
  disabled: boolean;
  isAddingAccount?: boolean;
  redirectTo: string;
}

export function useConditionalPasskeyAutofill({
  disabled,
  isAddingAccount = false,
  redirectTo,
}: ConditionalPasskeyAutofillOptions): void {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const attemptedAuth = useRef<unknown>(null);
  const redirectRef = useRef(redirectTo);
  const translationRef = useRef(t);
  redirectRef.current = redirectTo;
  translationRef.current = t;

  useEffect(() => {
    let active = true;
    const reportFailure = (error: unknown) => {
      const userFacingError = getUserFacingError(error);
      toast.error(translationRef.current(userFacingError.titleKey), {
        description: getUserFacingDescription(
          userFacingError,
          translationRef.current,
        ),
      });
      posthog.capture("auth_sign_in_failed", { method: "passkey" });
    };

    const preloadPasskey = async () => {
      if (
        disabled ||
        attemptedAuth.current === auth ||
        auth.supportsPasskeys() !== true ||
        typeof window === "undefined" ||
        !("PublicKeyCredential" in window) ||
        !window.PublicKeyCredential.isConditionalMediationAvailable
      ) {
        return;
      }

      let available = false;
      try {
        available =
          await window.PublicKeyCredential.isConditionalMediationAvailable();
      } catch {
        return;
      }
      if (!available || !active || attemptedAuth.current === auth) return;
      attemptedAuth.current = auth;

      try {
        const { data, error } = await auth.signIn.passkey({ autoFill: true });
        if (!active) return;
        if (error) {
          if (isPasskeyCancellation(error)) return;
          reportFailure(error);
          return;
        }

        posthog.capture("auth_sign_in", { method: "passkey" });
        navigate(redirectRef.current, {
          replace: true,
          state: createAccountSwitchNavigationState(
            data?.user?.id,
            isAddingAccount,
          ),
        });
      } catch (error) {
        if (!active || isPasskeyCancellation(error)) return;
        reportFailure(error);
      }
    };

    void preloadPasskey();
    return () => {
      active = false;
    };
  }, [auth, disabled, isAddingAccount, navigate]);
}
