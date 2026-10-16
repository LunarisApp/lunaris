import type { DatabaseOrTx } from "@app/db/utils";
import { and, count, eq, gt, or, sql } from "drizzle-orm";
import { invitation, member, organization, user } from "../../auth/auth.entity";

export async function lockOrganizationCapacity(
  db: DatabaseOrTx,
  organizationId: string
) {
  await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .for("no key update");
}

export async function readOrganizationOccupancy(
  db: DatabaseOrTx,
  organizationId: string
) {
  const [membersRow] = await db
    .select({ value: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  const [pendingRow] = await db
    .select({ value: count() })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        gt(invitation.expiresAt, new Date()),
        or(
          eq(invitation.status, "pending"),
          // Better Auth marks accepted before creating membership. Keep that
          // reservation until the member write commits, including failed retries.
          and(
            eq(invitation.status, "accepted"),
            eq(invitation.seatReserved, true)
          )
        )
      )
    );
  return {
    members: membersRow?.value ?? 0,
    pendingInvitations: pendingRow?.value ?? 0,
  };
}

export async function releaseAcceptedReservations(
  db: DatabaseOrTx,
  organizationId: string
) {
  await db
    .update(invitation)
    .set({ seatReserved: false })
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.seatReserved, true),
        sql`EXISTS (SELECT 1 FROM ${member} INNER JOIN ${user} ON ${member.userId} = ${user.id}
      WHERE ${member.organizationId} = ${invitation.organizationId}
        AND lower(${user.email}) = lower(${invitation.email}))`
      )
    );
}
