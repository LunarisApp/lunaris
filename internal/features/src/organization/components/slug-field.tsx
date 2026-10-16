import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import { permission } from "@repo/auth/permissions";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useAuth } from "@repo/features/auth";
import { usePermission } from "@repo/features/permissions";
import posthog from "posthog-js";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  markPendingOrganization,
  readPendingOrganization,
} from "../pending-organization";
import { isValidOrganizationSlug } from "../schemas";

interface SlugFieldProps {
  slug: string;
}

export function SlugField({ slug }: SlugFieldProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const { data: activeOrg } = auth.useActiveOrganization();
  const [value, setValue] = useState(slug);
  const canUpdate = usePermission(permission.organization.update);

  const isValid = isValidOrganizationSlug(value);
  const changed = value !== slug;
  const error =
    changed && !isValid
      ? t(
          value.trim()
            ? "organization.slugInvalid"
            : "organization.slugRequired"
        )
      : null;
  const errorId = useId();
  const hintId = useId();

  const handleBlur = async () => {
    if (!(canUpdate && activeOrg && changed)) {
      return;
    }
    if (!isValid) {
      toast.error(t("organization.slugInvalid"));
      setValue(slug);
      return;
    }
    const { error } = await auth.organization.update({
      data: { slug: value },
      organizationId: activeOrg.id,
    });
    if (error) {
      const ufe = getUserFacingError(error);
      toast.error(t(ufe.titleKey), {
        description: getUserFacingDescription(ufe, t),
      });
      setValue(slug);
      return;
    }
    posthog.capture("organization_updated", { field: "slug" });
    toast.success(t("organization.updated"));
    const pendingOrganization = readPendingOrganization();
    markPendingOrganization({
      id: activeOrg.id,
      name:
        pendingOrganization?.id === activeOrg.id
          ? pendingOrganization.name
          : activeOrg.name,
      slug: value,
    });
    navigate(`/${value}/settings`, { replace: true });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="organization-slug">{t("organization.slug")}</Label>
      <Input
        aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
        data-testid="organization-slug"
        disabled={!canUpdate}
        id="organization-slug"
        onBlur={handleBlur}
        onChange={(e) => setValue(e.target.value)}
        required
        value={value}
      />
      <p className="text-muted-foreground text-xs" id={hintId}>
        {t("organization.slugHint")}
      </p>
      {!!error && (
        <p className="text-destructive text-xs" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
