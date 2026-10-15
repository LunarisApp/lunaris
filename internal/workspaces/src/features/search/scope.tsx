import { createContext, useContext } from "react";
import { useOptionalCurrentWorkspace } from "../workspace";

export const SearchOrganizationContext = createContext<string | null>(null);

/** Homepage supplies organization; workspace routes supply their current workspace. */
export function useSearchScope() {
  const organizationId = useContext(SearchOrganizationContext);
  const current = useOptionalCurrentWorkspace();
  return {
    organizationId: organizationId ?? current?.workspace?.organization_id ?? "",
    workspaceId: current?.workspaceId ?? "",
  };
}
