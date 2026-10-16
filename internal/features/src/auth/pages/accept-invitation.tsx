import { Button } from "@lunarisapp/ui/components/button";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { useRegion } from "../../region";
import { AuthLayout } from "../components/auth-layout";
import { useAuth } from "../context";
import { showAuthErrorToast } from "../errors";
import { buildAddAccountPath, buildAuthRedirectPath } from "../redirect";

interface Invitation {
  email: string;
  id: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
}

type InvitationLoadState =
  | { status: "invalid" }
  | { status: "loading" }
  | { status: "mismatch" }
  | { status: "verification" }
  | {
      invitation: Invitation;
      status: "ready";
    };

export default function AcceptInvitationPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectionRequired, pathWithRegion } = useRegion();
  const [searchParams] = useSearchParams();
  const { data: session, isPending } = auth.useSession();
  const [loadState, setLoadState] = useState<InvitationLoadState>({
    status: "loading",
  });
  const [accepting, setAccepting] = useState(false);
  const invitationId = searchParams.get("invitationId");
  const authPath = buildAuthRedirectPath(pathWithRegion("/auth"), location);
  const verifyEmailPath = buildAuthRedirectPath(
    pathWithRegion("/auth/verify-email"),
    location
  );

  useEffect(() => {
    if (!session || !invitationId) return;

    let cancelled = false;

    const loadInvitation = async () => {
      setLoadState({ status: "loading" });

      const { data, error } = await auth.organization.getInvitation({
        query: { id: invitationId },
      });

      if (cancelled) return;

      if (error || !data) {
        const errorCode = (error as { code?: string } | null)?.code;
        const status =
          errorCode === "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION"
            ? "verification"
            : error?.status === 403
              ? "mismatch"
              : "invalid";
        setLoadState({ status });
        return;
      }

      setLoadState({ invitation: data, status: "ready" });
    };

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [auth, invitationId, session]);

  const handleAccept = async () => {
    if (loadState.status !== "ready" || !invitationId || accepting) return;

    setAccepting(true);

    try {
      const { error } = await auth.organization.acceptInvitation({
        invitationId,
      });

      if (error) {
        showAuthErrorToast(error, t);
        return;
      }

      posthog.capture("organization_invite_accepted");
      toast.success(t("auth.acceptInvitationSuccess"));
      navigate(pathWithRegion(`/${loadState.invitation.organizationSlug}`), {
        replace: true,
      });
    } finally {
      setAccepting(false);
    }
  };

  const handleSwitchAccount = () => {
    navigate(
      buildAddAccountPath(pathWithRegion("/auth"), {
        hash: location.hash,
        pathname: location.pathname,
        search: location.search,
      }),
      { replace: true },
    );
  };

  if (isPending) return null;

  if (selectionRequired) {
    return <Navigate replace to={authPath} />;
  }

  if (!invitationId) {
    return (
      <AuthLayout
        description={t("auth.invitationNotFoundDescription")}
        title={t("auth.invitationNotFound")}
      >
        <div />
      </AuthLayout>
    );
  }

  if (!session) {
    return <Navigate replace to={authPath} />;
  }

  if (loadState.status === "loading") {
    return (
      <AuthLayout
        description={t("common.loading")}
        title={t("auth.acceptInvitation")}
      >
        <div />
      </AuthLayout>
    );
  }

  if (loadState.status === "mismatch") {
    return (
      <AuthLayout
        description={t("auth.invitationEmailMismatch")}
        title={t("auth.acceptInvitation")}
      >
        <Button
          className="w-full"
          onClick={handleSwitchAccount}
          type="button"
          variant="outline"
        >
          {t("auth.switchAccount")}
        </Button>
      </AuthLayout>
    );
  }

  if (loadState.status === "verification") {
    return (
      <AuthLayout
        description={t("auth.invitationNeedsVerification")}
        title={t("auth.acceptInvitation")}
      >
        <Button
          className="w-full"
          nativeButton={false}
          render={<Link to={verifyEmailPath} />}
        >
          {t("auth.verifyEmail")}
        </Button>
      </AuthLayout>
    );
  }

  if (loadState.status === "invalid") {
    return (
      <AuthLayout
        description={t("auth.invitationNotFoundDescription")}
        title={t("auth.invitationNotFound")}
      >
        <div />
      </AuthLayout>
    );
  }

  const { invitation } = loadState;

  return (
    <AuthLayout
      description={t("auth.acceptInvitationDescription", {
        email: invitation.email,
        role: invitation.role,
        organization: invitation.organizationName,
      })}
      title={t("auth.acceptInvitation")}
    >
      <div className="flex flex-col gap-4">
        <Button
          className="w-full"
          data-testid="auth-accept-invitation"
          disabled={accepting}
          onClick={handleAccept}
          type="button"
        >
          {t("auth.acceptInvitationCta")}
        </Button>
        <Button
          className="w-full"
          data-testid="auth-accept-invitation-switch-account"
          onClick={handleSwitchAccount}
          type="button"
          variant="outline"
        >
          {t("auth.switchAccount")}
        </Button>
      </div>
    </AuthLayout>
  );
}
