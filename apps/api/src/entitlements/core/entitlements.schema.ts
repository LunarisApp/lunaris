import { entitlementSnapshotSchema } from "@repo/auth/entitlements";
import type { infer as Infer } from "zod";

export const EntitlementSnapshotDto = entitlementSnapshotSchema.meta({
  id: "EntitlementSnapshotDto",
});
export type EntitlementSnapshotDto = Infer<typeof EntitlementSnapshotDto>;
