import { useApi } from "@repo/features/api";
import { useQuery } from "@tanstack/react-query";

export function useOrganizationDeveloperMode(
  organizationId: string | undefined,
  enabled = true,
) {
  const api = useApi();
  return useQuery({
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    queryKey: ["organization-developer-mode", api.baseUrl, organizationId],
    queryFn: ({ signal }) =>
      api.get<{ enabled: boolean }>(
        `/v1/organizations/${encodeURIComponent(organizationId ?? "")}/extension-registries/developer-mode`,
        { signal },
      ),
    enabled: Boolean(organizationId) && enabled,
  });
}
