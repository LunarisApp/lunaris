import type { AuthClient } from "@repo/auth/client";
import {
  clearEncryptionKeyCache,
  type PowerSyncSession,
} from "@repo/data/core";
import {
  deleteFileStorageDatabases,
  getFileStorageWorkspaceIds,
} from "@repo/data/features/attachments";
import { clearEntitlementSnapshots } from "../entitlements";
import { resetPostHogIdentity } from "@repo/utils/posthog-browser";
import { log, parseError } from "evlog";
import posthog from "posthog-js";

export const logout = async ({
  authClient,
  beforeSignOut,
  powerSyncSession,
}: {
  authClient: AuthClient;
  beforeSignOut?: () => void;
  powerSyncSession: PowerSyncSession | null;
}) => {
  posthog.capture("auth_logout");
  let fileStorageWorkspaceIds: string[] = [];
  if (powerSyncSession) {
    try {
      fileStorageWorkspaceIds = await getFileStorageWorkspaceIds(
        powerSyncSession.database
      );
    } catch (error) {
      log.warn({
        action: "auth.logout.storage_cleanup",
        outcome: "partial_failure",
        storage: { stage: "list_workspace_databases" },
        error: parseError(error),
      });
    }
    await powerSyncSession.purge();
  }
  await deleteFileStorageDatabases(fileStorageWorkspaceIds);
  beforeSignOut?.();
  await authClient.signOut();
  resetPostHogIdentity(posthog);
  await clearEncryptionKeyCache();
  clearEntitlementSnapshots();
};
