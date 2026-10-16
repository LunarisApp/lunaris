"use client";

import {
  useOrganizationMembersQuery,
  type OrganizationMember,
} from "@repo/data/features/organizations";
import { useAuth } from "@repo/features/auth";
import { useMemo } from "react";

export type MemberUser = OrganizationMember["user"];

export function useOrgMembersMap(): {
  map: Map<string, MemberUser>;
  isLoading: boolean;
} {
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const { data: activeOrg } = auth.useActiveOrganization();
  const orgId = activeOrg?.id ?? "";

  const query = useOrganizationMembersQuery(orgId);

  const map = useMemo(() => {
    const next = new Map<string, MemberUser>();
    for (const member of query.data ?? []) {
      next.set(member.user.id, member.user);
    }
    return next;
  }, [query.data]);

  return {
    map,
    isLoading: !!session?.user?.id && !!orgId && query.isLoading,
  };
}
