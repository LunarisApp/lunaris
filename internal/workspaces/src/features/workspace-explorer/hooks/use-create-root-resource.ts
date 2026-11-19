import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGridLayoutStore } from "../../grid-layout/context";
import {
  type OpenResourceInput,
  useOrganizationNavigation,
} from "../../organization-navigation";
import { VIRTUAL_ROOT_ID } from "../constants";
import { useWorkspaceResourcesMap } from "../store";
import { useWorkspaceResourceCreation } from "./use-workspace-resource-creation";

interface OpenCreatedResourceOptions {
  onOpened?: () => void;
  target?: OpenResourceInput["target"];
}

/** Append to the root and open in the invoking panel once the route can resolve the resource. */
export function useCreateRootResource() {
  const { t } = useTranslation();
  const { createResource } = useWorkspaceResourceCreation();
  const { openResource } = useOrganizationNavigation();
  const resourcesMap = useWorkspaceResourcesMap();
  const requestRename = useGridLayoutStore(
    (state) => state.requestRenameResource
  );
  const [pending, setPending] = useState<
    (OpenCreatedResourceOptions & { resourceId: string }) | null
  >(null);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const resource = resourcesMap.get(pending.resourceId);
    if (!resource?.resource_type_id) {
      return;
    }
    setPending(null);
    openResource({
      resourceId: resource.id,
      resourceTypeId: resource.resource_type_id,
      schemaVersion: resource.schema_version ?? 1,
      target: pending.target,
      title: resource.name || t("common.untitled"),
    });
    if (!resource.name) {
      requestRename(resource.id);
    }
    pending.onOpened?.();
  }, [openResource, pending, requestRename, resourcesMap, t]);

  return useCallback(
    async (
      type: ResourceTypeDefinition,
      options?: OpenCreatedResourceOptions
    ) => {
      const result = await createResource(VIRTUAL_ROOT_ID, type);
      if (result) {
        setPending({ resourceId: result.resourceId, ...options });
      }
    },
    [createResource]
  );
}
