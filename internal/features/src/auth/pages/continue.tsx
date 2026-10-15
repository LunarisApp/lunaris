import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router";
import { AuthBackLink } from "../components/auth-back-link";
import { AuthLayout } from "../components/auth-layout";
import { EmailSummary } from "../components/email-summary";
import { SsoButtons } from "../components/sso-buttons";
import { parseEmailAuthContinuationState } from "../flow";
import { useAuthRedirect } from "../redirect";
import { EmailSignInForm } from "./email-sign-in";
import { RegisterForm } from "./register";

export default function ContinuePage() {
  const location = useLocation();
  const state = parseEmailAuthContinuationState(location.state);
  const { pathWithRedirect } = useAuthRedirect();

  if (!state) {
    return <Navigate replace to={pathWithRedirect("/auth")} />;
  }

  if (state.resolution.kind === "password") {
    return <EmailSignInForm email={state.email} />;
  }

  if (state.resolution.kind === "register") {
    return <RegisterForm email={state.email} />;
  }

  return <SocialContinuation email={state.email} />;
}

function SocialContinuation({ email }: { email: string }) {
  const { t } = useTranslation();
  const { pathWithRedirect } = useAuthRedirect();

  return (
    <AuthLayout
      description={t("auth.googleAccountDescription")}
      leading={
        <AuthBackLink
          label={t("auth.changeEmail")}
          state={{ email }}
          to={pathWithRedirect("/auth")}
        />
      }
      title={t("auth.continueWithGoogle")}
    >
      <EmailSummary email={email} />
      <div className="mt-4">
        <SsoButtons />
      </div>
    </AuthLayout>
  );
}
