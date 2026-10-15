import {
  createViewInstanceId,
  type RegisteredView,
  useViews,
} from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import {
  useOrganizationNavigation,
  useOrganizationViewState,
} from "@repo/workspaces/organization-navigation";
import { log, parseError } from "evlog";
import { useCallback, useRef } from "react";

interface ExtensionViewLauncherProps {
  view: RegisteredView;
}

function ExtensionViewLauncher({
  view: { definition, extensionId },
}: ExtensionViewLauncherProps) {
  const { openView } = useOrganizationNavigation();
  const { activeViewInstanceId } = useOrganizationViewState();
  const viewInstanceId = createViewInstanceId(definition.viewId);
  const preloadStarted = useRef<RegisteredView["definition"] | null>(null);
  const preload = useCallback(() => {
    if (!definition.preload || preloadStarted.current === definition) return;
    preloadStarted.current = definition;
    void definition.preload().catch((error) => {
      if (preloadStarted.current === definition) preloadStarted.current = null;
      log.debug({
        action: "extension_view.preload",
        outcome: "failure",
        extension: { id: extensionId },
        view: { id: definition.viewId },
        error: parseError(error),
      });
    });
  }, [definition, extensionId]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-pressed={activeViewInstanceId === viewInstanceId}
            className={
              activeViewInstanceId === viewInstanceId
                ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent"
                : undefined
            }
            onPointerEnter={preload}
            onFocus={preload}
            onPointerDown={preload}
            onClick={() => {
              openView({
                placement:
                  definition.target.kind === "standalone"
                    ? definition.target.launcher?.defaultPlacement
                    : undefined,
                extensionId,
                title: definition.name,
                viewId: definition.viewId,
              });
            }}
            size="icon"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" icon={definition.icon} />
        <span className="sr-only">{definition.name}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{definition.name}</TooltipContent>
    </Tooltip>
  );
}

export function ExtensionViewLaunchers() {
  const views = useViews().filter(
    ({ definition }) =>
      definition.target.kind === "standalone" && definition.target.launcher
  );

  return views.map((view) => (
    <ExtensionViewLauncher
      key={createViewInstanceId(view.definition.viewId)}
      view={view}
    />
  ));
}
