import { SetMetadata } from "@nestjs/common";
import type { AppPermission } from "@repo/auth/permissions";

export const PERMISSION_METADATA = "lunaris:permission";
export const DEFER_PERMISSION_METADATA = "lunaris:permission:defer";

export const RequirePermission = (required: AppPermission) =>
  SetMetadata(PERMISSION_METADATA, required);

/**
 * Defers permission enforcement to a route guard that establishes its own
 * principal after global guards run.
 */
export const DeferPermissionCheck = () =>
  SetMetadata(DEFER_PERMISSION_METADATA, true);
