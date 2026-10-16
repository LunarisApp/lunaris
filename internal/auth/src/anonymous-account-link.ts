import { log } from "evlog";

interface OrganizationSummary {
  id: string;
}

interface OrganizationMemberSummary {
  user: {
    id: string;
  };
}

interface OrganizationAdapterLike {
  createMember: (data: {
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
  }) => Promise<unknown>;
  deleteOrganization: (organizationId: string) => Promise<unknown>;
  findMemberByOrgId: (data: {
    organizationId: string;
    userId: string;
  }) => Promise<unknown | null>;
  listMembers: (data: {
    organizationId: string;
    limit?: number;
  }) => Promise<{ members: OrganizationMemberSummary[]; total: number }>;
  listOrganizations: (userId: string) => Promise<OrganizationSummary[]>;
}

interface InternalAdapterLike {
  listSessions: (userId: string) => Promise<{ token: string }[]>;
  updateSession: (
    token: string,
    data: { activeOrganizationId: string }
  ) => Promise<unknown>;
}

interface AdoptAnonymousOrganizationOptions {
  adapter: OrganizationAdapterLike;
  anonymousUserId: string;
  claimedUserId: string;
  internalAdapter: InternalAdapterLike;
  log?: typeof log;
}

async function resolveDisposableClaimedOrganization(params: {
  adapter: OrganizationAdapterLike;
  claimedOrganizationId?: string | null;
  claimedUserId: string;
}) {
  const { adapter, claimedOrganizationId, claimedUserId } = params;
  const candidateId =
    claimedOrganizationId ??
    (await adapter.listOrganizations(claimedUserId))[0]?.id ??
    null;
  if (!candidateId) {
    return null;
  }

  const members = await adapter.listMembers({
    organizationId: candidateId,
    limit: 2,
  });

  return {
    id: candidateId,
    isDisposable:
      members.total === 1 && members.members[0]?.user.id === claimedUserId,
  };
}

export async function adoptAnonymousOrganizationOnLink(
  params: AdoptAnonymousOrganizationOptions
) {
  const {
    adapter,
    anonymousUserId,
    claimedUserId,
    internalAdapter,
    log: logger = log,
  } = params;

  const guestOrganization = (
    await adapter.listOrganizations(anonymousUserId)
  )[0];
  if (!guestOrganization) {
    logger.warn({
      tag: "Auth",
      msg: "anonymous link missing guest organization",
      auth: { anonymousUserId, claimedUserId },
    });
    throw new Error("Anonymous account has no organization to adopt");
  }

  const claimedOrganization = await resolveDisposableClaimedOrganization({
    adapter,
    claimedOrganizationId:
      (await adapter.listOrganizations(claimedUserId))[0]?.id ?? null,
    claimedUserId,
  });

  const existingMembership = await adapter.findMemberByOrgId({
    organizationId: guestOrganization.id,
    userId: claimedUserId,
  });
  if (!existingMembership) {
    await adapter.createMember({
      organizationId: guestOrganization.id,
      userId: claimedUserId,
      role: "owner",
      createdAt: new Date(),
    });
  }

  const sessions = await internalAdapter.listSessions(claimedUserId);
  for (const session of sessions) {
    await internalAdapter.updateSession(session.token, {
      activeOrganizationId: guestOrganization.id,
    });
  }

  if (
    claimedOrganization &&
    claimedOrganization.id !== guestOrganization.id &&
    claimedOrganization.isDisposable
  ) {
    await adapter.deleteOrganization(claimedOrganization.id);
    logger.info({
      tag: "Auth",
      msg: "deleted disposable claimed organization after guest adoption",
      auth: {
        claimedOrganizationId: claimedOrganization.id,
        guestOrganizationId: guestOrganization.id,
        claimedUserId,
      },
    });
    return;
  }

  if (claimedOrganization && claimedOrganization.id !== guestOrganization.id) {
    logger.warn({
      tag: "Auth",
      msg: "claimed organization kept because it is not empty",
      auth: {
        claimedOrganizationId: claimedOrganization.id,
        guestOrganizationId: guestOrganization.id,
        claimedUserId,
      },
    });
  }
}
