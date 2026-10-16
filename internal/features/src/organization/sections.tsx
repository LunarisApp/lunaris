import { createContext, useContext, type ComponentType } from "react";

export interface OrganizationSections {
  AuditLog?: ComponentType<{ active: boolean; organizationId: string }>;
  Members?: ComponentType;
  Teams?: ComponentType;
}

const OrganizationSectionsContext = createContext<OrganizationSections>({});
export const OrganizationSectionsProvider =
  OrganizationSectionsContext.Provider;
export function useOrganizationSections() {
  return useContext(OrganizationSectionsContext);
}

/** Minimal contract for optional team assignment in the core invitation form. */
export interface OrganizationTeamSummary {
  id: string;
  name: string;
}
export interface InvitationTeamPickerProps {
  onTeamChange: (teamId: string | null) => void;
  selectedTeamId: string | null;
  teams: OrganizationTeamSummary[];
}
