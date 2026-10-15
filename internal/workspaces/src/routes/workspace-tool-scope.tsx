import { Outlet } from "react-router";
import { OrganizationPluginRuntimeProvider } from "../extensions/organization-runtime";

export default function WorkspaceToolScope() {
  return (
    <OrganizationPluginRuntimeProvider>
      <Outlet />
    </OrganizationPluginRuntimeProvider>
  );
}
