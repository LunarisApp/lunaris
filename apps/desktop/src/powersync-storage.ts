import { hashUserId } from "@repo/data/core";

export async function resolveNativePowerSyncStorageName(
  regionId: string,
  userId: string
) {
  const hash = await hashUserId(JSON.stringify([regionId, userId]));
  return `lunaris.v2.${hash}.db`;
}
