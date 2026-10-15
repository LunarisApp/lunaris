import { permission } from "@repo/auth/permissions";
import { SYNC_ACCESS, useSyncAccess } from "@repo/data/core";
import {
  useWorkspacesQuery,
  WORKSPACE_INDEX_SYNC_STREAMS,
} from "@repo/data/features/workspaces";
import { LoaderView } from "@repo/features/loading";
import { useAllPermissions } from "@repo/features/permissions";
import { useRegionClients } from "@repo/features/region";
import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { readLastWorkspace } from "./last-workspace";

export function WorkspacesEntry({
  children,
  initialLocationKey,
}: {
  children: ReactNode;
  initialLocationKey: string;
}) {
  const location = useLocation();
  const shouldResume =
    location.key === initialLocationKey ||
    location.state?.resumeLastWorkspace === true;
  return shouldResume ? (
    <ResumeWorkspace>{children}</ResumeWorkspace>
  ) : (
    children
  );
}

function ResumeWorkspace({ children }: { children: ReactNode }) {
  const { authClient } = useRegionClients();
  const { data: session } = authClient?.useSession() ?? { data: null };
  const { data: organization } = authClient?.useActiveOrganization() ?? {
    data: null,
  };
  const canRead = useAllPermissions([
    permission.workspace.read,
    permission.content.read,
  ]);
  if (!session || !organization) return <LoaderView />;
  if (!canRead) return children;
  return (
    <SavedWorkspace
      key={`${session.user.id}:${organization.id}`}
      organizationId={organization.id}
      organizationSlug={organization.slug}
      userId={session.user.id}
    >
      {children}
    </SavedWorkspace>
  );
}

function SavedWorkspace({
  children,
  organizationId,
  organizationSlug,
  userId,
}: {
  children: ReactNode;
  organizationId: string;
  organizationSlug: string;
  userId: string;
}) {
  const [saved] = useState(() => readLastWorkspace(userId, organizationId));
  if (!saved) return children;
  return (
    <AvailableWorkspace
      organizationId={organizationId}
      organizationSlug={organizationSlug}
      saved={saved}
    >
      {children}
    </AvailableWorkspace>
  );
}

function AvailableWorkspace({
  children,
  organizationId,
  organizationSlug,
  saved,
}: {
  children: ReactNode;
  organizationId: string;
  organizationSlug: string;
  saved: NonNullable<ReturnType<typeof readLastWorkspace>>;
}) {
  const syncAccess = useSyncAccess();
  const query = useWorkspacesQuery({
    id: saved.workspaceId,
    organizationId,
    options:
      syncAccess === SYNC_ACCESS.cloud
        ? { streams: WORKSPACE_INDEX_SYNC_STREAMS }
        : undefined,
  });
  const workspace = query.data?.find(
    (entry) =>
      entry.id === saved.workspaceId &&
      entry.organization_id === organizationId,
  );
  const pending = query.isLoading || (query.isFetching && !query.data?.length);
  const [finished, setFinished] = useState(false);
  const showList = Boolean(query.error) || (!pending && !workspace?.slug);
  useEffect(() => {
    if (showList) setFinished(true);
  }, [showList]);
  // Once the list is shown, later sync updates must not take navigation away.
  if (finished || showList) return children;
  if (pending) return <LoaderView />;
  if (!workspace?.slug) return children;
  return (
    <Navigate
      replace
      state={{ restoredWorkspace: true }}
      to={`/${organizationSlug}/${workspace.slug}${saved.viewPath}`}
    />
  );
}
