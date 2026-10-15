import type { UserSession } from "@thallesp/nestjs-better-auth";
import { NoActiveOrganizationError } from "../../sync/sync.errors";

export function requireActiveOrganization(session: UserSession): string {
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) throw new NoActiveOrganizationError();
  return organizationId;
}
