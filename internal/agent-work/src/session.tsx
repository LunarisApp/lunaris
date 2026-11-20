import { FEATURE } from "@repo/auth/entitlements";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth";
import { useFeatureAccess } from "@repo/features/entitlements";
import { usePlatform, type AgentWorkScope } from "@repo/platform";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAgentWork } from "./use-agent-work";

type AgentWorkSession = ReturnType<typeof useAgentWork>;
const SessionContext = createContext<AgentWorkSession | null>(null);
const RegisterSessionContext = createContext<(() => () => void) | null>(null);

export function useAgentWorkAccess() {
  const { kind } = usePlatform();
  const { allowed, pending } = useFeatureAccess(FEATURE.agentWork);
  const { data } = useAuth().useSession();
  const { baseUrl } = useApi();
  const userId = data?.user.id;
  const organizationId = data?.session.activeOrganizationId;
  const scope =
    kind === "desktop" && allowed && !pending && userId && organizationId
      ? { apiUrl: baseUrl, organizationId, userId }
      : undefined;
  return { allowed, kind, pending, scope };
}

export function AgentWorkSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [viewCount, setViewCount] = useState(0);
  const registerView = useCallback(() => {
    setViewCount((count) => count + 1);
    return () => setViewCount((count) => count - 1);
  }, []);
  const { scope } = useAgentWorkAccess();
  const session = useAgentWork(viewCount > 0 ? scope : undefined);
  return (
    <RegisterSessionContext.Provider value={registerView}>
      <SessionContext.Provider value={session}>
        {children}
      </SessionContext.Provider>
    </RegisterSessionContext.Provider>
  );
}

export function useAgentWorkSession(scope: AgentWorkScope) {
  const registerView = useContext(RegisterSessionContext);
  const shared = useContext(SessionContext);
  const standalone = useAgentWork(shared ? undefined : scope);
  useEffect(() => registerView?.(), [registerView]);
  return shared ?? standalone;
}
