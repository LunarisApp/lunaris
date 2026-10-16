import type {
  ResourceCreateResult,
  ResourceTypeDefinition,
} from "@lunarisapp/plugin-sdk";
import { permission } from "@repo/auth/permissions";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getResourceCapacityErrorMessageKey } from "@repo/features/entitlements";
import { usePermission } from "@repo/features/permissions";
import { useWorkspaceActions } from "../store";

export function useWorkspaceResourceCreation() {
  const { t } = useTranslation();
  const {
    createFolder: createFolderAction,
    createResource: createResourceAction,
  } = useWorkspaceActions();
  const canCreate = usePermission(permission.content.write);

  const createResource = useCallback(
    async (
      parentId: string,
      resource: ResourceTypeDefinition
    ): Promise<ResourceCreateResult | null> => {
      if (!canCreate) {
        return null;
      }
      try {
        return await createResourceAction(parentId, resource);
      } catch (error) {
        toast.error(
          t(
            getResourceCapacityErrorMessageKey(
              error,
              "explorer.failedToCreateResource"
            )
          )
        );
        return null;
      }
    },
    [canCreate, createResourceAction, t]
  );

  const createFolder = useCallback(
    async (parentId: string): Promise<string | null> => {
      if (!canCreate) {
        return null;
      }
      try {
        return await createFolderAction(parentId);
      } catch (error) {
        toast.error(
          t(
            getResourceCapacityErrorMessageKey(
              error,
              "explorer.failedToCreateFolder"
            )
          )
        );
        return null;
      }
    },
    [canCreate, createFolderAction, t]
  );

  return { canCreate, createFolder, createResource };
}
