import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import { Button } from "@lunarisapp/ui/components/button";
import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import type { OrganizationExtensionRegistry } from "@repo/data/features/organization-extension-registries";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useApi } from "@repo/features/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function MarketplacesSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const id = useId();
  const [url, setUrl] = useState("");
  const path = `/v1/organizations/${encodeURIComponent(organizationId)}/extension-registries`;
  const registriesKey = [
    "organization-marketplaces",
    api.baseUrl,
    organizationId,
  ];
  const registries = useQuery({
    queryKey: registriesKey,
    queryFn: () => api.get<OrganizationExtensionRegistry[]>(path),
  });
  const showError = (error: unknown) => {
    const facing = getUserFacingError(error);
    toast.error(t(facing.titleKey), {
      description: getUserFacingDescription(facing, t),
    });
  };
  const add = useMutation({
    mutationFn: () =>
      api.post<OrganizationExtensionRegistry>(path, {
        body: { url: url.trim() },
      }),
    onSuccess: async () => {
      setUrl("");
      await queryClient.invalidateQueries({ queryKey: registriesKey });
    },
    onError: showError,
  });
  const remove = useMutation({
    mutationFn: (registryId: string) =>
      api.delete(`${path}/${encodeURIComponent(registryId)}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: registriesKey });
    },
    onError: showError,
  });
  const busy = add.isPending || remove.isPending;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>{t("organization.developer.developmentOnly")}</AlertTitle>
        <AlertDescription>
          {t("organization.developer.warning")}
        </AlertDescription>
      </Alert>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && url.trim()) {
            add.mutate();
          }
        }}
      >
        <Label htmlFor={`${id}-url`}>{t("organization.developer.url")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${id}-url`}
            type="url"
            required
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/marketplace.json"
            aria-describedby={`${id}-url-help`}
          />
          <Button type="submit" disabled={busy || !url.trim()}>
            {t("organization.developer.add")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs" id={`${id}-url-help`}>
          {t("organization.developer.urlHelp")}
        </p>
      </form>
      {!!registries.isPending && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("common.loading")}
        </p>
      )}
      {!!registries.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("organization.developer.loadError")}
        </p>
      )}
      <ul
        aria-label={t("organization.developer.marketplaces")}
        className="divide-y border-y"
      >
        {registries.data?.map((registry) => (
          <li
            key={registry.id}
            className="flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <p className="break-all text-sm">{registry.location}</p>
              {!!registry.official && (
                <p className="text-muted-foreground text-xs">
                  {t("organization.developer.official")}
                </p>
              )}
            </div>
            {!registry.official && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={t("organization.developer.removeLabel", {
                  marketplace: registry.location,
                })}
                onClick={() => remove.mutate(registry.id)}
              >
                {t("common.remove")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        {t("organization.developer.disableHelp")}
      </p>
    </div>
  );
}
