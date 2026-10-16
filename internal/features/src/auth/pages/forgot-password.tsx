import { Button } from "@lunarisapp/ui/components/button";
import { Field, FieldError, FieldLabel } from "@lunarisapp/ui/components/field";
import { useForm, zodResolver } from "@lunarisapp/ui/components/form";
import { Input } from "@lunarisapp/ui/components/input";
import posthog from "posthog-js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router";
import { object, string, type z } from "zod";
import { useRegion } from "../../region";
import { AuthBackLink } from "../components/auth-back-link";
import { AuthLayout } from "../components/auth-layout";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";

const forgotPasswordSchema = object({
  email: string().email("Invalid email address"),
});

type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const {
    manifest,
    authUrl,
    pathWithRegion,
    selectionRequired,
    urlWithRegion,
  } = useRegion();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (selectionRequired) {
    return <Navigate replace to="/auth" />;
  }

  if (manifest?.capabilities?.passwordResetEmail === false) {
    return (
      <AuthLayout
        title={t("auth.forgotPasswordTitle")}
        description={t("auth.emailRecoveryUnavailable")}
        leading={
          <AuthBackLink
            label={t("auth.backToSignIn")}
            to={pathWithRegion("/auth/email")}
          />
        }
      >
        {null}
      </AuthLayout>
    );
  }

  const onSubmit = async (data: ForgotPasswordSchema) => {
    const { error } = await auth.requestPasswordReset({
      email: data.email,
      redirectTo: urlWithRegion(authUrl("/auth/reset-password")),
    });
    if (error) {
      showAuthErrorToast(error, t);
    } else {
      posthog.capture("forgot_password_requested");
      setSent(true);
    }
  };

  return (
    <AuthLayout
      description={t("auth.forgotPasswordDescription")}
      leading={
        <AuthBackLink
          label={t("auth.backToSignIn")}
          to={pathWithRegion("/auth")}
        />
      }
      title={t("auth.forgotPasswordTitle")}
    >
      {sent ? (
        <div className="space-y-4 text-center" data-testid="auth-forgot-sent">
          <p className="text-muted-foreground text-sm">
            {t("auth.resetEmailSent")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("auth.rememberedPassword")}{" "}
            <Link
              className="text-primary underline underline-offset-4"
              to={pathWithRegion("/auth/email")}
            >
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Field>
              <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
              <Input
                aria-describedby={
                  errors.email ? "forgot-email-error" : undefined
                }
                aria-invalid={!!errors.email}
                autoComplete="email"
                autoFocus
                data-testid="auth-forgot-email"
                id="email"
                placeholder="email@example.com"
                type="email"
                {...register("email")}
              />
              <FieldError errors={[errors.email]} id="forgot-email-error" />
            </Field>
            <Button
              className="w-full"
              data-testid="auth-forgot-submit"
              disabled={isSubmitting}
              type="submit"
            >
              {t("auth.sendResetLink")}
            </Button>
          </form>
          <p className="mt-4 text-center text-muted-foreground text-sm">
            {t("auth.rememberedPassword")}{" "}
            <Link
              className="text-primary underline underline-offset-4"
              to={pathWithRegion("/auth/email")}
            >
              {t("auth.signIn")}
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
