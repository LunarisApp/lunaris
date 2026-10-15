import type { DrizzleDatabase } from "@app/db/utils";
import { APIError } from "better-auth/api";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { invitation, member, organization, team } from "../../auth/auth.entity";

const RECOVERY_READ_PATHS = new Set([
  "/organization/list",
  "/organization/set-active",
  "/organization/get-full-organization",
  "/organization/get-active-member",
  "/organization/get-active-member-role",
  "/organization/check-slug",
  "/organization/create",
  "/organization/list-user-invitations",
]);

export async function assertAuthOrganizationAccess(
  db: DrizzleDatabase,
  input: { path: string; body: unknown; activeOrganizationId?: string | null },
) {
  if (
    (!input.path.startsWith("/organization/") &&
      input.path !== "/customer/portal") ||
    RECOVERY_READ_PATHS.has(input.path)
  )
    return;
  const body =
    input.body && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : {};
  const nested =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : {};
  const ids = new Set<string>();
  const explicitId = input.path === "/customer/portal"
    ? input.activeOrganizationId
    : input.path === "/organization/update-team"
      ? nested.organizationId
      : body.organizationId;
  if (typeof explicitId === "string" && explicitId.length > 0) ids.add(explicitId);
  // Resolve only fields used by this endpoint. An unrelated body field must
  // never replace the organization that the real mutation will target.
  if (
    [
      "/organization/accept-invitation",
      "/organization/reject-invitation",
      "/organization/cancel-invitation",
    ].includes(input.path) &&
    typeof body.invitationId === "string"
  ) {
    const [row] = await db
      .select({ organizationId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, body.invitationId));
    if (row) ids.add(row.organizationId);
  } else if (
    [
      "/organization/remove-member",
      "/organization/update-member-role",
    ].includes(input.path)
  ) {
    const target = body.memberId ?? body.memberIdOrEmail;
    if (typeof target === "string") {
      const [row] = await db
        .select({ organizationId: member.organizationId })
        .from(member)
        .where(eq(member.id, target));
      if (row) ids.add(row.organizationId);
    }
  } else if (
    [
      "/organization/update-team",
      "/organization/remove-team",
      "/organization/add-team-member",
      "/organization/remove-team-member",
      "/organization/set-active-team",
    ].includes(input.path) &&
    typeof body.teamId === "string"
  ) {
    const [row] = await db
      .select({ organizationId: team.organizationId })
      .from(team)
      .where(eq(team.id, body.teamId));
    if (row) ids.add(row.organizationId);
  }
  if (!ids.size && input.activeOrganizationId)
    ids.add(input.activeOrganizationId);
  if (!ids.size) return;
  const [org] = await db
    .select({ requestedAt: organization.deletionRequestedAt })
    .from(organization)
    .where(
      and(
        inArray(organization.id, [...ids]),
        isNotNull(organization.deletionRequestedAt),
      ),
    )
    .limit(1);
  if (org?.requestedAt)
    throw new APIError("FORBIDDEN", {
      code: "ORGANIZATION_PENDING_DELETION",
      message:
        "Organization is scheduled for deletion. Restore it before making changes.",
    });
}
