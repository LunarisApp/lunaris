import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import { Field, FieldError, FieldLabel } from "@lunarisapp/ui/components/field";
import { useForm, zodResolver } from "@lunarisapp/ui/components/form";
import { Input } from "@lunarisapp/ui/components/input";
import { Separator } from "@lunarisapp/ui/components/separator";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import {
  AnonymousIcon,
  ArrowRight01Icon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { object, string, type z } from "zod";
import { useRegion } from "../../region";
import { AuthLayout } from "../components/auth-layout";
import { SsoButtons } from "../components/sso-buttons";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";
import { getEmailPrefill } from "../flow";
import { useConditionalPasskeyAutofill } from "../hooks/use-conditional-passkey-autofill";
import { useLastLoginMethod } from "../hooks/use-last-login-method";
import {
  createAccountSwitchNavigationState,
  isLogoutNavigationState,
  useAuthRedirect,
} from "../redirect";

const emailSchema = object({
  email: string().trim().toLowerCase().email("Invalid email address"),
});

type EmailSchema = z.infer<typeof emailSchema>;

export interface SignInPageProps {
  onAnonymousSessionCreated?: () => void;
}

export default function SignInPage({
  onAnonymousSessionCreated,
}: SignInPageProps) {
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAddingAccount, resolvedRedirectTo } = useAuthRedirect();
  const logoutPending = isLogoutNavigationState(location.state);

  useEffect(() => {
    if (session || !logoutPending) {
      return;
    }
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [
    location.hash,
    location.pathname,
    location.search,
    logoutPending,
    navigate,
    session,
  ]);

  if (session && !isAddingAccount && !logoutPending) {
    return <Navigate replace to={resolvedRedirectTo} />;
  }

  return <AuthForm onAnonymousSessionCreated={onAnonymousSessionCreated} />;
}

function AuthForm({ onAnonymousSessionCreated }: SignInPageProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectionRequired, manifest } = useRegion();
  const signupsAllowed = manifest?.signupsAllowed !== false;
  const { isAddingAccount, pathWithRedirect, resolvedRedirectTo } =
    useAuthRedirect();
  const [searchParams] = useSearchParams();
  const [guestLoading, setGuestLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const lastLoginMethod = useLastLoginMethod();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<EmailSchema>({
    defaultValues: { email: getEmailPrefill(location.state) },
    mode: "onChange",
    resolver: zodResolver(emailSchema),
  });

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      toast.error(error);
    }
  }, [searchParams]);

  useConditionalPasskeyAutofill({
    disabled: selectionRequired,
    isAddingAccount,
    redirectTo: resolvedRedirectTo,
  });

  const handleContinueAsGuest = async () => {
    setGuestLoading(true);
    try {
      const { data, error } = await auth.signIn.anonymous();
      if (error) {
        throw error;
      }
      onAnonymousSessionCreated?.();
      posthog.capture("auth_sign_in", { method: "anonymous" });
      if (isAddingAccount && data?.user.id) {
        navigate(resolvedRedirectTo, {
          replace: true,
          state: createAccountSwitchNavigationState(data.user.id),
        });
      }
    } catch (error) {
      showAuthErrorToast(error, t);
      posthog.capture("auth_sign_in_failed", { method: "anonymous" });
      setGuestLoading(false);
    }
  };

  const handleEmailContinue = async ({ email }: EmailSchema) => {
    const { data: resolution, error } = await auth.resolveEmailMethod(email);

    if (error || !resolution) {
      showAuthErrorToast(error ?? new Error("Missing auth method"), t);
      posthog.capture("auth_email_method_resolution_failed");
      return;
    }

    posthog.capture("auth_email_method_resolved", {
      kind: resolution.kind,
      ...(resolution.kind === "social"
        ? { provider: resolution.provider }
        : {}),
    });
    navigate(pathWithRedirect("/auth/continue"), {
      state: { email, resolution },
    });
  };

  const formDisabled =
    guestLoading || isSubmitting || ssoLoading || selectionRequired;

  return (
    <AuthLayout
      description={t(
        signupsAllowed ? "auth.description" : "auth.registrationDisabled"
      )}
      regionControl="full"
      title={t("auth.title")}
    >
      <div className="space-y-4">
        <SsoButtons disabled={formDisabled} onLoadingChange={setSsoLoading} />
        <form onSubmit={handleSubmit(handleEmailContinue)}>
          <Field>
            <FieldLabel className="sr-only" htmlFor="auth-email">
              {t("auth.email")}
            </FieldLabel>
            <div className="relative">
              <Input
                aria-describedby={errors.email ? "auth-email-error" : undefined}
                aria-invalid={!!errors.email}
                autoComplete="username webauthn"
                autoFocus
                className="h-11 pr-12"
                data-testid="auth-entry-email"
                disabled={formDisabled}
                id="auth-email"
                placeholder="email@example.com"
                type="email"
                {...register("email")}
              />
              {lastLoginMethod === "email" ? (
                <Badge
                  className="pointer-events-none absolute top-0 right-12 -translate-y-1/2"
                  data-testid="auth-last-used-email"
                  variant="secondary"
                >
                  {t("auth.lastUsed")}
                </Badge>
              ) : null}
              <Button
                aria-label={t("auth.continueWithEmail")}
                className="absolute top-1 right-1 size-9"
                data-testid="auth-entry-email-submit"
                disabled={formDisabled || !isValid}
                size="icon-lg"
                title={t("auth.continueWithEmail")}
                type="submit"
              >
                {isSubmitting ? (
                  <Spinner className="size-4" />
                ) : (
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                  />
                )}
              </Button>
            </div>
            <FieldError errors={[errors.email]} id="auth-email-error" />
          </Field>
        </form>
      </div>
      {signupsAllowed && (
        <>
          <div
            className="my-4 flex items-center gap-3"
            data-testid="auth-entry-divider"
          >
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-sm">
              {t("auth.or")}
            </span>
            <Separator className="flex-1" />
          </div>
          <Button
            className="h-11 w-full"
            data-testid="auth-entry-guest"
            disabled={formDisabled}
            onClick={handleContinueAsGuest}
            variant="outline"
          >
            {guestLoading ? (
              <Spinner className="size-5" />
            ) : (
              <HugeiconsIcon aria-hidden="true" icon={AnonymousIcon} />
            )}
            {t("auth.continueAsGuest")}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
