import { Google } from "@lunarisapp/ui/brand-icons";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import type { SocialAuthProvider } from "@repo/auth/client";
import posthog from "posthog-js";
import { type ElementType, type SVGProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRegion } from "../../region";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";
import { useLastLoginMethod } from "../hooks/use-last-login-method";
import { useAuthRedirect } from "../redirect";

interface SsoButtonsProps {
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

type SocialIcon = ElementType<SVGProps<SVGSVGElement>>;

const PROVIDERS: {
  id: SocialAuthProvider;
  labelKey: string;
  icon: SocialIcon;
}[] = [{ id: "google", labelKey: "auth.continueWithGoogle", icon: Google }];

export function SsoButtons({ disabled, onLoadingChange }: SsoButtonsProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { authUrl, selectionRequired, manifest } = useRegion();
  const { urlWithRedirect } = useAuthRedirect();
  const lastLoginMethod = useLastLoginMethod();
  const [loadingProvider, setLoadingProvider] =
    useState<SocialAuthProvider | null>(null);

  const handleSocialSignIn = async (provider: SocialAuthProvider) => {
    posthog.capture("sso_sign_in_attempted", { provider });
    setLoadingProvider(provider);
    onLoadingChange?.(true);
    const { error } = await auth.signIn.social({
      provider,
      callbackURL: urlWithRedirect(authUrl("/")),
    });
    if (error) {
      showAuthErrorToast(error, t);
      setLoadingProvider(null);
      onLoadingChange?.(false);
    }
  };

  const isDisabled = disabled || loadingProvider !== null || selectionRequired;
  const enabledProviders = PROVIDERS.filter(({ id }) =>
    manifest?.socialProviders?.includes(id)
  );
  if (enabledProviders.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {enabledProviders.map(({ id, labelKey, icon: Icon }) => (
        <Button
          aria-label={t(labelKey)}
          className="relative h-11 flex-1"
          disabled={isDisabled}
          key={id}
          onClick={() => handleSocialSignIn(id)}
          variant="outline"
        >
          {loadingProvider === id ? (
            <Spinner className="size-5" />
          ) : (
            <>
              <Icon aria-hidden="true" className="size-5" />
              <span>{t(labelKey)}</span>
            </>
          )}
          {lastLoginMethod === id ? (
            <Badge
              className="pointer-events-none absolute top-0 right-3 -translate-y-1/2"
              data-testid={`auth-last-used-${id}`}
              variant="secondary"
            >
              {t("auth.lastUsed")}
            </Badge>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
