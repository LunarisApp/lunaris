import { Button } from "@lunarisapp/ui/components/button";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@lunarisapp/ui/components/field";
import { useForm, zodResolver } from "@lunarisapp/ui/components/form";
import { Input } from "@lunarisapp/ui/components/input";
import { usePlatform } from "@repo/platform";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router";
import { object, string, z } from "zod";
import { useRegion } from "../../region";
import { AuthBackLink } from "../components/auth-back-link";
import { AuthLayout } from "../components/auth-layout";
import { EmailSummary } from "../components/email-summary";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";
import { useAuthRedirect } from "../redirect";

const signUpSchema = object({
  name: string().min(1, "Name is required"),
  email: string().email("Invalid email address"),
  password: string().min(8, "Password must be at least 8 characters"),
});

type SignUpSchema = z.infer<typeof signUpSchema>;

export interface RegisterPageProps {
  onRegistrationCompleted?: (email: string) => void;
}

export default function RegisterPage({
  onRegistrationCompleted,
}: RegisterPageProps) {
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const [registrationPending, setRegistrationPending] = useState(false);
  const {
    isAddingAccount,
    pathWithRedirect,
    resolvedRedirectTo,
  } = useAuthRedirect();

  if (
    session &&
    !session.user.isAnonymous &&
    !isAddingAccount &&
    !registrationPending
  ) {
    return (
      <Navigate
        replace
        to={
          session.user.emailVerified
            ? resolvedRedirectTo
            : pathWithRedirect("/auth/verify-email")
        }
      />
    );
  }

  return (
    <RegisterForm
      activateCreatedSession={session?.user.isAnonymous === true}
      onRegistrationCompleted={onRegistrationCompleted}
      onRegistrationPendingChange={setRegistrationPending}
    />
  );
}

export function RegisterForm({
  activateCreatedSession = false,
  email,
  onRegistrationCompleted,
  onRegistrationPendingChange,
}: {
  activateCreatedSession?: boolean;
  email?: string;
  onRegistrationCompleted?: (email: string) => void;
  onRegistrationPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { refetch: refetchSession } = auth.useSession();
  const { navigation } = usePlatform();
  const navigate = useNavigate();
  const { selectionRequired, manifest } = useRegion();
  const { pathWithRedirect } = useAuthRedirect();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpSchema>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: email ?? "", password: "" },
  });

  if (selectionRequired || manifest?.signupsAllowed === false) {
    return <Navigate replace to={pathWithRedirect("/auth")} />;
  }

  const onSubmit = async (data: SignUpSchema) => {
    onRegistrationPendingChange?.(true);
    let registrationCompleted = false;
    try {
      const { data: createdSession, error } = await auth.signUp.email({
        callbackURL: new URL(
          pathWithRedirect("/"),
          navigation.origin(),
        ).toString(),
        name: data.name,
        email: data.email,
        password: data.password,
      });
      if (error) {
        showAuthErrorToast(error, t);
        posthog.capture("auth_sign_up_failed");
        return;
      }

      if (activateCreatedSession && createdSession?.token) {
        const { error: activationError } = await auth.multiSession.setActive({
          sessionToken: createdSession.token,
        });
        if (activationError) {
          showAuthErrorToast(activationError, t);
          posthog.capture("auth_sign_up_failed");
          return;
        }
      }

      posthog.capture("auth_sign_up");
      onRegistrationCompleted?.(data.email.trim().toLowerCase());
      localStorage.setItem("lunaris_pending_onboarding", "true");

      try {
        await refetchSession({ query: { disableCookieCache: true } });
      } catch (error) {
        log.warn({
          tag: "Auth",
          msg: "post-registration session refresh failed",
          error: parseError(error),
        });
      }

      registrationCompleted = true;
      navigate(pathWithRedirect("/auth/verify-email"), { replace: true });
    } finally {
      if (!registrationCompleted) {
        onRegistrationPendingChange?.(false);
      }
    }
  };

  return (
    <AuthLayout
      description={t("auth.signUpDescription")}
      leading={
        <AuthBackLink
          label={t("auth.backToSignIn")}
          to={pathWithRedirect("/auth")}
        />
      }
      title={t("auth.signUp")}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        {email ? (
          <Field>
            <FieldTitle>{t("auth.email")}</FieldTitle>
            <input type="hidden" {...register("email")} />
            <EmailSummary email={email} />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
            <Input
              aria-describedby={errors.email ? "register-email-error" : undefined}
              aria-invalid={!!errors.email}
              autoComplete="email"
              autoFocus
              data-testid="auth-register-email"
              id="email"
              placeholder="email@example.com"
              type="email"
              {...register("email")}
            />
            <FieldError errors={[errors.email]} id="register-email-error" />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="name">{t("auth.name")}</FieldLabel>
          <Input
            aria-describedby={errors.name ? "register-name-error" : undefined}
            aria-invalid={!!errors.name}
            autoComplete="name"
            autoFocus={!!email}
            data-testid="auth-register-name"
            id="name"
            {...register("name")}
          />
          <FieldError errors={[errors.name]} id="register-name-error" />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
          <Input
            aria-describedby={
              errors.password ? "register-password-error" : undefined
            }
            aria-invalid={!!errors.password}
            autoComplete="new-password"
            data-testid="auth-register-password"
            id="password"
            type="password"
            {...register("password")}
          />
          <FieldError errors={[errors.password]} id="register-password-error" />
        </Field>
        <Button
          className="h-11 w-full"
          data-testid="auth-register-submit"
          disabled={isSubmitting}
          type="submit"
        >
          {t("auth.signUp")}
        </Button>
      </form>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        {t("auth.haveAccount")}{" "}
        <Link
          className="text-primary underline underline-offset-4"
          to={pathWithRedirect("/auth/email")}
        >
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
