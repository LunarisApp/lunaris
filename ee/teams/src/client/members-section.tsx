import { useRef } from "react";
import { useAuth } from "@repo/features/auth";
import { MembersSection as CoreMembersSection } from "@repo/features/organization/components/members-section";
import { useOrganizationTeamsQuery } from "./queries";
import { InvitationTeamPicker } from "./invitation-team-picker";

export function MembersSection() {
  const { data: activeOrg } = useAuth().useActiveOrganization();
  const stableOrg = useRef(activeOrg);
  if (activeOrg) stableOrg.current = activeOrg;
  const teams = useOrganizationTeamsQuery(stableOrg.current?.id);
  if (teams.error) throw teams.error;
  return (
    <CoreMembersSection
      teams={teams.data ?? []}
      TeamPicker={InvitationTeamPicker}
    />
  );
}
