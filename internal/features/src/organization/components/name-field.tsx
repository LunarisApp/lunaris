import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import { permission } from "@repo/auth/permissions";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useAuth } from "@repo/features/auth";
import { usePermission } from "@repo/features/permissions";
import posthog from "posthog-js";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  markPendingOrganization,
  readPendingOrganization,
} from "../pending-organization";

interface NameFieldProps {
  name: string;
  originalName: string;
}

export function NameField({ name, originalName }: NameFieldProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: activeOrg } = auth.useActiveOrganization();
  const [value, setValue] = useState(name);
  const canUpdate = usePermission(permission.organization.update);
  const errorId = useId();
  const invalid = !value.trim();

  const handleBlur = async () => {
    if (
      !(canUpdate && activeOrg && value.trim()) ||
      value.trim() === originalName
    ) {
      return;
    }
    const { error } = await auth.organization.update({
      data: { name: value.trim() },
      organizationId: activeOrg.id,
    });
    if (error) {
      const ufe = getUserFacingError(error);
      toast.error(t(ufe.titleKey), {
        description: getUserFacingDescription(ufe, t),
      });
      setValue(originalName);
      return;
    }
    posthog.capture("organization_updated", { field: "name" });
    toast.success(t("organization.updated"));
    const pendingOrganization = readPendingOrganization();
    markPendingOrganization({
      id: activeOrg.id,
      name: value.trim(),
      slug:
        pendingOrganization?.id === activeOrg.id
          ? pendingOrganization.slug
          : activeOrg.slug,
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="organization-name">{t("organization.name")}</Label>
      <Input
        aria-describedby={invalid ? errorId : undefined}
        aria-invalid={invalid}
        data-testid="organization-name"
        disabled={!canUpdate}
        id="organization-name"
        onBlur={handleBlur}
        onChange={(e) => setValue(e.target.value)}
        required
        value={value}
      />
      {invalid && (
        <p className="text-destructive text-xs" id={errorId} role="alert">
          {t("organization.nameRequired")}
        </p>
      )}
    </div>
  );
}
