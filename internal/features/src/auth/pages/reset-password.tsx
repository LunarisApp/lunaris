import { Button } from "@lunarisapp/ui/components/button";
import { Field, FieldError, FieldLabel } from "@lunarisapp/ui/components/field";
import { useForm, zodResolver } from "@lunarisapp/ui/components/form";
import { Input } from "@lunarisapp/ui/components/input";
import posthog from "posthog-js";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { object, string, z } from "zod";
import { useRegion } from "../../region";
import { AuthLayout } from "../components/auth-layout";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";

const resetPasswordSchema = object({
  password: string().min(8, "Password must be at least 8 characters"),
  confirmPassword: string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { manifest, pathWithRegion, selectionRequired } = useRegion();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  if (selectionRequired) {
    return <Navigate replace to="/auth" />;
  }

  if (!token) {
    return (
      <AuthLayout
        description={t("auth.resetPasswordDescription")}
        title={t("auth.resetPasswordTitle")}
      >
        <div className="space-y-4 text-center" data-testid="auth-reset-invalid">
          <p className="text-destructive text-sm">
            {t("auth.invalidResetToken")}
          </p>
          {manifest?.capabilities?.passwordResetEmail !== false ? <Link
            className="text-primary text-sm underline underline-offset-4"
            data-testid="auth-reset-forgot-link"
            to={pathWithRegion("/auth/forgot-password")}
          >
            {t("auth.forgotPassword")}
          </Link> : <p className="text-muted-foreground text-sm">{t("auth.emailRecoveryUnavailable")}</p>}
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async (data: ResetPasswordSchema) => {
    const { error } = await auth.resetPassword({
      newPassword: data.password,
      token,
    });
    if (error) {
      showAuthErrorToast(error, t);
    } else {
      posthog.capture("reset_password_submitted");
      toast.success(t("auth.passwordResetSuccess"));
      navigate(pathWithRegion("/auth"));
    }
  };

  return (
    <AuthLayout
      description={t("auth.resetPasswordDescription")}
      title={t("auth.resetPasswordTitle")}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Field>
          <FieldLabel htmlFor="password">{t("auth.newPassword")}</FieldLabel>
          <Input
            aria-describedby={errors.password ? "reset-password-error" : undefined}
            aria-invalid={!!errors.password}
            autoComplete="new-password"
            autoFocus
            data-testid="auth-reset-password"
            id="password"
            type="password"
            {...register("password")}
          />
          <FieldError errors={[errors.password]} id="reset-password-error" />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">
            {t("auth.confirmPassword")}
          </FieldLabel>
          <Input
            aria-describedby={
              errors.confirmPassword ? "confirm-password-error" : undefined
            }
            aria-invalid={!!errors.confirmPassword}
            autoComplete="new-password"
            data-testid="auth-reset-confirm"
            id="confirmPassword"
            type="password"
            {...register("confirmPassword")}
          />
          <FieldError
            errors={[errors.confirmPassword]}
            id="confirm-password-error"
          />
        </Field>
        <Button
          className="w-full"
          data-testid="auth-reset-submit"
          disabled={isSubmitting}
          type="submit"
        >
          {t("auth.resetPassword")}
        </Button>
      </form>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        <Link
          className="text-primary underline underline-offset-4"
          to={pathWithRegion("/auth")}
        >
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
