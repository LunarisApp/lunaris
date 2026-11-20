import { AppToolVisibility } from "@repo/features/appbar";
import { AgentWorkSessionProvider } from "@repo/agent-work/routes";
import { useRegionClients } from "@repo/features/region";
import { createContext, useContext, useLayoutEffect, useRef } from "react";
import {
  matchPath,
  type Location,
  UNSAFE_LocationContext as LocationContext,
  useOutlet,
} from "react-router";
import type { AppToolId } from "../app-tools";

type ToolLocations = Partial<Record<AppToolId, Location>>;
const ToolLocationContext = createContext<ToolLocations>({});

export function useLastAppToolLocation(tool: AppToolId) {
  return useContext(ToolLocationContext)[tool];
}

export function AppToolLayout() {
  const { authClient } = useRegionClients();
  const { data: session } = authClient!.useSession();
  return <AppToolViews key={session?.user.id} />;
}

function AppToolViews() {
  const outlet = useOutlet();
  const locationContext = useContext(LocationContext);
  const activeTool = matchPath(
    "/:organizationSlug/agent-work",
    locationContext.location.pathname
  )
    ? "agent-work"
    : "workspaces";
  const previous = useRef<
    Partial<
      Record<
        typeof activeTool,
        { outlet: typeof outlet; location: typeof locationContext }
      >
    >
  >({});

  useLayoutEffect(() => {
    // Keep the last committed outlet mounted so workbench renderers and drafts survive.
    previous.current[activeTool] = { outlet, location: locationContext };
  }, [activeTool, locationContext, outlet]);

  return (
    <AgentWorkSessionProvider>
      <ToolLocationContext.Provider
        value={{
          workspaces: previous.current.workspaces?.location.location,
          "agent-work": previous.current["agent-work"]?.location.location,
        }}
      >
        {(["workspaces", "agent-work"] as const).map((tool) => {
          const active = tool === activeTool;
          const view = active
            ? { outlet, location: locationContext }
            : previous.current[tool];
          return view ? (
            <AppToolVisibility active={active} key={tool}>
              <div hidden={!active} inert={!active}>
                {/* Keep route params and location paired while a tool is hidden. */}
                <LocationContext.Provider value={view.location}>
                  {view.outlet}
                </LocationContext.Provider>
              </div>
            </AppToolVisibility>
          ) : null;
        })}
      </ToolLocationContext.Provider>
    </AgentWorkSessionProvider>
  );
}
