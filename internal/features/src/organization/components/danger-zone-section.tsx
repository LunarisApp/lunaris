import { InputConfirmationDialog } from "@lunarisapp/ui/blocks/input-confirmation-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import { Button } from "@lunarisapp/ui/components/button";
import { permission } from "@repo/auth/permissions";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useOrganizationsQuery } from "@repo/data/features/organizations";
import { useAuth } from "@repo/features/auth";
import { useApi } from "@repo/features/api";
import { usePermission } from "@repo/features/permissions";
import posthog from "posthog-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  organizationDeletionKey,
  organizationDeletionRedirectKey,
  type OrganizationDeletionStatus,
} from "./organization-deletion-gate";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useRegion } from "@repo/features/region";
import { appendRedirectToPath } from "@repo/features/auth/redirect";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isPersonalOrganization } from "../utils";

export function DangerZoneSection({
  isOwner,
  organization,
}: {
  isOwner: boolean;
  organization: { id: string; isPersonal?: boolean; slug: string };
}) {
  const { t } = useTranslation();
  const api = useApi();
  const organizations = useOrganizationsQuery();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const recentSignIn = Boolean(
    session &&
      Date.now() - new Date(session.session.createdAt).getTime() <=
        15 * 60 * 1000,
  );
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathWithRegion } = useRegion();
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const canDelete = usePermission(permission.organization.delete);

  useEffect(() => {
    if (
      searchParams.get("confirmOrganizationDeletion") !== organization.id ||
      !recentSignIn || !isOwner || !canDelete
    ) return;
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("confirmOrganizationDeletion");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, organization.id, recentSignIn, isOwner, canDelete]);

  const beginDeletion = () => {
    if (pending) return;
    if (session && Date.now() - new Date(session.session.createdAt).getTime() <= 15 * 60 * 1000) {
      setOpen(true);
      return;
    }
    const next = new URLSearchParams(location.search);
    next.set("confirmOrganizationDeletion", organization.id);
    const returnTo = `${location.pathname}?${next}${location.hash}`;
    navigate(
      appendRedirectToPath(pathWithRegion("/auth?addAccount=true"), returnTo),
      { state: { email: session?.user.email } },
    );
  };

  if (!isOwner || !canDelete) return null;

  if (isPersonalOrganization(organization)) {
    return (
      <Alert>
        <AlertTitle>
          {t("organization.personalOrganizationRestrictionsTitle")}
        </AlertTitle>
        <AlertDescription>
          {t("organization.personalOrganizationRestrictions")}
        </AlertDescription>
      </Alert>
    );
  }

  const handleDeleteRequest = async () => {
    if (!canDelete || pending) return;
    if (
      !session ||
      Date.now() - new Date(session.session.createdAt).getTime() >
        15 * 60 * 1000
    ) {
      beginDeletion();
      return;
    }
    setPending(true);
    try {
      const status = await api.post<OrganizationDeletionStatus>(
        "/v1/organization/delete-request",
        {
          body: {
            organizationId: organization.id,
            confirmationSlug: organization.slug,
          },
        },
      );
      const nextOrganization = organizations.data?.find(
        (candidate) => candidate.id !== organization.id && candidate.slug &&
          !candidate.deletion_requested_at && !candidate.deletion_purge_after &&
          !["scheduled", "purging", "unavailable"].includes(
            queryClient.getQueryData<OrganizationDeletionStatus>(
              organizationDeletionKey(candidate.id),
            )?.status ?? "active",
          ),
      );
      queryClient.setQueryData(
        organizationDeletionRedirectKey(organization.id),
        nextOrganization?.slug ?? null,
      );
      queryClient.setQueryData(organizationDeletionKey(organization.id), status);
      posthog.capture("organization_delete_requested");
      setOpen(false);
      toast.success(t("organization.deletionScheduledTitle"));
    } catch (err) {
      const ufe = getUserFacingError(err);
      toast.error(t(ufe.titleKey), {
        description: getUserFacingDescription(ufe, t),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="organization-danger-zone-heading"
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <h2
        className="text-base font-semibold text-destructive"
        id="organization-danger-zone-heading"
      >
        {t("organization.dangerZone")}
      </h2>
      <div className="border-destructive/20 bg-destructive/[0.025] flex max-w-3xl flex-col gap-5 rounded-xl border p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-destructive">
            {t("organization.deleteOrganization")}
          </p>
          <p className="max-w-prose text-sm leading-relaxed text-destructive">
            {t("organization.deleteSummary")}
          </p>

        </div>
        <Button
          disabled={pending}
          className="h-11 w-full shrink-0 lg:h-8 lg:w-auto"
          onClick={beginDeletion}
          size="sm"
          variant="destructive"
        >
          {t("organization.deleteOrganization")}
        </Button>
        <InputConfirmationDialog
          pending={pending}
          cancelLabel={t("common.cancel")}
          confirmationText={organization.slug}
          confirmLabel={t("organization.deleteOrganization")}
          description={t("organization.deleteConfirmDescription")}
          onConfirm={handleDeleteRequest}
          onOpenChange={setOpen}
          open={open}
          title={t("organization.deleteConfirmTitle")}
        />
      </div>
    </section>
  );
}
