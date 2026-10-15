import { type AdditionalOptions, useQuery } from "@powersync/react";
import { useMemo } from "react";
import { ORGANIZATION_DIRECTORY_SYNC_STREAMS } from "../organizations";
import {
  type OrganizationExtensionRegistryEntity,
  ORGANIZATION_EXTENSION_REGISTRIES_TABLE,
} from "./table";

const OPTIONS: AdditionalOptions = { streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS };

export interface OrganizationExtensionRegistry {
  addedAt: string;
  addedBy: string | null;
  id: string;
  kind: "github" | "https";
  location: string;
  manifestUrl: string;
  official: boolean;
  organizationId: string;
  updatedAt: string;
}

function mapRegistry(
  row: OrganizationExtensionRegistryEntity,
): OrganizationExtensionRegistry {
  return {
    addedAt: row.added_at ?? "",
    addedBy: row.added_by ?? null,
    id: row.registry_id ?? "",
    kind: row.kind === "github" ? "github" : "https",
    location: row.location ?? "",
    manifestUrl: row.manifest_url ?? "",
    official: row.official === 1,
    organizationId: row.organization_id ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export function useOrganizationExtensionRegistriesQuery(
  organizationId: string | undefined,
  options: AdditionalOptions = OPTIONS,
) {
  const query = useQuery<OrganizationExtensionRegistryEntity>(
    `SELECT * FROM ${ORGANIZATION_EXTENSION_REGISTRIES_TABLE}
     WHERE organization_id = ?
     ORDER BY official DESC, added_at ASC`,
    [organizationId ?? ""],
    options,
  );
  const data = useMemo(() => query.data?.map(mapRegistry), [query.data]);
  return { ...query, data };
}
