import { lazy, type PropsWithChildren } from "react";
import { OrganizationSectionsProvider } from "@repo/features/organization/sections";

const Teams = lazy(() =>
  import("@repo/ee-teams/client").then((module) => ({
    default: module.TeamsSection,
  }))
);
const AuditLog = lazy(() =>
  import("@repo/ee-audit/client").then((module) => ({
    default: module.AuditLogSection,
  }))
);
const Members = lazy(() =>
  import("@repo/ee-teams/client").then((module) => ({
    default: module.MembersSection,
  }))
);
const sections = { Teams, AuditLog, Members };

export function EnterpriseOrganizationProvider({
  children,
}: PropsWithChildren) {
  return (
    <OrganizationSectionsProvider value={sections}>
      {children}
    </OrganizationSectionsProvider>
  );
}
