import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lunarisapp/ui/components/alert-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import { Label } from "@lunarisapp/ui/components/label";
import { Switch } from "@lunarisapp/ui/components/switch";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useApi } from "@repo/features/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useOrganizationDeveloperMode } from "../use-organization-developer-mode";

export function DeveloperModeSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const id = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const path = `/v1/organizations/${encodeURIComponent(organizationId)}/extension-registries`;
  const modeKey = ["organization-developer-mode", api.baseUrl, organizationId];
  const mode = useOrganizationDeveloperMode(organizationId);
  const enabled = mode.data?.enabled === true;
  const showError = (error: unknown) => {
    const facing = getUserFacingError(error);
    toast.error(t(facing.titleKey), {
      description: getUserFacingDescription(facing, t),
    });
  };
  const updateMode = useMutation({
    mutationFn: (value: boolean) =>
      api.patch<{ enabled: boolean }>(`${path}/developer-mode`, {
        body: { enabled: value },
      }),
    onSuccess: async (data) => {
      // A focus-triggered read may have started before the update committed.
      await queryClient.cancelQueries({ queryKey: modeKey });
      queryClient.setQueryData(modeKey, data);
      setConfirmOpen(false);
    },
    onError: showError,
  });

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <h2 className="font-semibold text-base" id={`${id}-heading`}>
        {t("organization.developer.title")}
      </h2>
      <div className="max-w-3xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor={`${id}-switch`}>
              {t("organization.developer.title")}
            </Label>
            <p
              className="text-muted-foreground text-sm"
              id={`${id}-description`}
            >
              {t("organization.developer.description")}
            </p>
          </div>
          <Switch
            aria-describedby={`${id}-description`}
            checked={enabled}
            disabled={mode.isPending || mode.isError || updateMode.isPending}
            id={`${id}-switch`}
            onCheckedChange={(value) =>
              value ? setConfirmOpen(true) : updateMode.mutate(false)
            }
          />
        </div>
        {!!mode.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t("organization.developer.loadError")}
          </p>
        )}
        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!updateMode.isPending) {
              setConfirmOpen(open);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("organization.developer.confirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("organization.developer.warning")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="outline"
                disabled={updateMode.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={updateMode.isPending}
                onClick={() => updateMode.mutate(true)}
              >
                {t("organization.developer.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
