import { Button } from "@lunarisapp/ui/components/button";
import { Field, FieldError, FieldLabel } from "@lunarisapp/ui/components/field";
import { useForm, zodResolver } from "@lunarisapp/ui/components/form";
import { Input } from "@lunarisapp/ui/components/input";
import posthog from "posthog-js";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router";
import { object, string, z } from "zod";
import { useRegion } from "../../region";
import { AuthBackLink } from "../components/auth-back-link";
import { AuthLayout } from "../components/auth-layout";
import { EmailSummary } from "../components/email-summary";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";
import {
  createAccountSwitchNavigationState,
  useAuthRedirect,
} from "../redirect";

const signInSchema = object({
  email: string().email("Invalid email address"),
  password: string().min(1, "Password is required"),
});

type SignInSchema = z.infer<typeof signInSchema>;

export function parseTwoFactorChallenge(
  result: unknown,
): { methods: string[] } | undefined {
  if (
    !result ||
    typeof result !== "object" ||
    !("twoFactorRedirect" in result) ||
    result.twoFactorRedirect !== true
  ) {
    return;
  }

  if (
    "twoFactorMethods" in result &&
    Array.isArray(result.twoFactorMethods) &&
    result.twoFactorMethods.every((method) => typeof method === "string")
  ) {
    return { methods: result.twoFactorMethods };
  }

  return { methods: [] };
}

export default function EmailSignInPage() {
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const { isAddingAccount, resolvedRedirectTo } = useAuthRedirect();

  if (session && !isAddingAccount) {
    return <Navigate replace to={resolvedRedirectTo} />;
  }

  return <EmailSignInForm />;
}

export function EmailSignInForm({ email }: { email?: string }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const { selectionRequired, manifest } = useRegion();
  const {
    isAddingAccount,
    pathWithRedirect,
    resolvedRedirectTo,
  } = useAuthRedirect();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInSchema>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: email ?? "", password: "" },
  });

  if (selectionRequired) {
    return <Navigate replace to="/auth" />;
  }

  const onSubmit = async (data: SignInSchema) => {
    const { data: result, error } = await auth.signIn.email({
      email: data.email,
      password: data.password,
    });
    const twoFactorChallenge = parseTwoFactorChallenge(result);
    if (error) {
      showAuthErrorToast(error, t);
      posthog.capture("auth_sign_in_failed", { method: "email" });
    } else if (twoFactorChallenge) {
      posthog.capture("auth_two_factor_challenged", {
        methods: twoFactorChallenge.methods,
      });
      navigate(pathWithRedirect("/auth/two-factor"), { replace: true });
    } else {
      posthog.capture("auth_sign_in", { method: "email" });
      navigate(resolvedRedirectTo, {
        replace: true,
        state: createAccountSwitchNavigationState(
          result?.user?.id,
          isAddingAccount,
        ),
      });
    }
  };

  return (
    <AuthLayout
      description={t("auth.description")}
      leading={
        <AuthBackLink
          label={t("auth.backToSignIn")}
          to={pathWithRedirect("/auth")}
        />
      }
      title={t("auth.title")}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        {email ? (
          <>
            <input type="hidden" {...register("email")} />
            <EmailSummary email={email} />
          </>
        ) : (
          <Field>
            <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
            <Input
              aria-describedby={errors.email ? "sign-in-email-error" : undefined}
              aria-invalid={!!errors.email}
              autoComplete="email"
              data-testid="auth-signin-email"
              id="email"
              placeholder="email@example.com"
              type="email"
              {...register("email")}
            />
            <FieldError errors={[errors.email]} id="sign-in-email-error" />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
          <Input
            aria-describedby={
              errors.password ? "sign-in-password-error" : undefined
            }
            aria-invalid={!!errors.password}
            autoComplete="current-password"
            autoFocus={Boolean(email)}
            data-testid="auth-signin-password"
            id="password"
            type="password"
            {...register("password")}
          />
          <FieldError errors={[errors.password]} id="sign-in-password-error" />
        </Field>
        {manifest?.capabilities?.passwordResetEmail !== false ? <div className="flex justify-end">
          <Link
            className="text-primary text-sm underline underline-offset-4"
            to={pathWithRedirect("/auth/forgot-password")}
          >
            {t("auth.forgotPassword")}
          </Link>
        </div> : <p className="text-muted-foreground text-sm">{t("auth.emailRecoveryUnavailable")}</p>}
        <Button
          className="h-11 w-full"
          data-testid="auth-signin-submit"
          disabled={isSubmitting}
          type="submit"
        >
          {t("auth.signIn")}
        </Button>
      </form>
      {manifest?.signupsAllowed !== false && <p className="text-muted-foreground mt-4 text-center text-sm">
        {t("auth.noAccount")}{" "}
        <Link
          className="text-primary underline underline-offset-4"
          to={pathWithRedirect("/auth/register")}
        >
          {t("auth.signUp")}
        </Link>
      </p>}
    </AuthLayout>
  );
}
