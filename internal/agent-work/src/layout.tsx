import { Button } from "@lunarisapp/ui/components/button";
import { HugeiconsIcon, Shield01Icon } from "@lunarisapp/ui/icons";
import type { AgentWorkScope } from "@repo/platform";
import type { DockviewApi } from "dockview";
import {
  DockviewReact,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import "dockview-react/dist/styles/dockview.css";
import "@lunarisapp/ui/workbench.css";

const panelIds = ["conversations", "chat", "activity"] as const;
type PanelId = (typeof panelIds)[number];
export interface AgentLayoutHandle {
  reveal: (id: PanelId) => void;
}
type Slots = Record<PanelId, ReactNode>;
const Panels = createContext<Slots | null>(null);
const Compact = createContext(false);
const LayoutControls = createContext<{
  reveal: (id: PanelId) => void;
  pending: number;
} | null>(null);
const theme = { name: "agent-work", className: "grid-layout-theme", gap: 10 };
function Panel({ api }: IDockviewPanelProps) {
  return useContext(Panels)?.[api.id as PanelId];
}
const components = { agent: Panel };
function GroupActions({
  activePanel,
  containerApi,
}: IDockviewHeaderActionsProps) {
  const { t } = useTranslation();
  const controls = useContext(LayoutControls);
  const compact = useContext(Compact);
  return (
    <div className="flex items-center gap-1">
      {(activePanel?.id === "chat" ||
        (!containerApi.getPanel("chat") &&
          activePanel?.id === "conversations")) &&
        Boolean(controls?.pending) && (
          <Button
            aria-label={t("agentWork.pendingApprovals", {
              count: controls?.pending,
            })}
            title={t("agentWork.pendingApprovals", {
              count: controls?.pending,
            })}
            onClick={() => controls?.reveal("activity")}
            size={compact ? "icon-sm" : "sm"}
            variant="ghost"
          >
            <HugeiconsIcon icon={Shield01Icon} />
            {!compact &&
              t("agentWork.pendingApprovals", { count: controls?.pending })}
          </Button>
        )}
    </div>
  );
}
function PanelTab({ api }: IDockviewPanelHeaderProps) {
  return <span className="flex h-full items-center px-2">{api.title}</span>;
}

export function AgentLayout(props: {
  scope: AgentWorkScope;
  slots: Slots;
  pending: number;
  ref?: Ref<AgentLayoutHandle>;
}) {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <Panels.Provider value={props.slots}>
      <Compact.Provider value={compact}>
        <LayoutHost
          key={compact ? "compact" : "wide"}
          scope={props.scope}
          pending={props.pending}
          ref={props.ref}
          compact={compact}
        />
      </Compact.Provider>
    </Panels.Provider>
  );
}
function LayoutHost({
  scope,
  pending,
  compact,
  ref,
}: {
  scope: AgentWorkScope;
  pending: number;
  compact: boolean;
  ref?: Ref<AgentLayoutHandle>;
}) {
  const { t } = useTranslation();
  const apiRef = useRef<DockviewApi | null>(null);
  const disposeRef = useRef<() => void>(() => undefined);
  const storageKey = `lunaris.agent-panel-widths.v1:${JSON.stringify([scope.apiUrl, scope.userId, scope.organizationId, compact])}`;
  const reveal = (id: PanelId) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    api.getPanel(id)?.api.setActive();
  };
  useImperativeHandle(ref, () => ({ reveal }));
  useEffect(() => () => disposeRef.current(), []);
  useEffect(() => {
    for (const panel of apiRef.current?.panels ?? []) {
      panel.api.setTitle(t(`agentWork.${panel.id}`));
    }
  }, [t]);
  return (
    <main
      aria-label={t("editor.agentWork")}
      className="flex min-h-0 flex-1 flex-col"
    >
      <LayoutControls.Provider value={{ reveal, pending }}>
        <div className="relative min-h-0 flex-1">
          <DockviewReact
            className="h-full w-full"
            components={components}
            defaultTabComponent={PanelTab}
            rightHeaderActionsComponent={GroupActions}
            theme={theme}
            disableFloatingGroups
            disableDnd
            onReady={({ api }) => {
              disposeRef.current();
              apiRef.current = api;
              let widths: Record<string, unknown> = {};
              try {
                const saved: unknown = JSON.parse(
                  localStorage.getItem(storageKey) ?? "{}"
                );
                if (
                  saved &&
                  typeof saved === "object" &&
                  !Array.isArray(saved)
                ) {
                  widths = saved as Record<string, unknown>;
                }
              } catch {
                /* Unavailable storage uses default panel widths. */
              }
              for (const id of ["chat", "conversations", "activity"] as const) {
                const width = widths[id];
                api.addPanel({
                  id,
                  component: "agent",
                  title: t(`agentWork.${id}`),
                  renderer: "onlyWhenVisible",
                  initialWidth:
                    typeof width === "number" &&
                    Number.isFinite(width) &&
                    width >= 220
                      ? width
                      : id === "conversations"
                        ? 256
                        : id === "activity"
                          ? 304
                          : 600,
                  minimumWidth: compact ? 0 : 220,
                  position:
                    id === "chat"
                      ? undefined
                      : {
                          referencePanel: "chat",
                          direction: compact
                            ? "within"
                            : id === "conversations"
                              ? "left"
                              : "right",
                        },
                });
              }
              api.getPanel("chat")?.api.setActive();
              let timer: ReturnType<typeof setTimeout> | undefined;
              let serialized: string | undefined;
              const save = () => {
                if (!serialized) {
                  return;
                }
                try {
                  localStorage.setItem(storageKey, serialized);
                } catch {
                  /* Layout remains usable without persistence. */
                }
              };
              const listener = api.onDidLayoutChange(() => {
                serialized = JSON.stringify(
                  Object.fromEntries(
                    api.panels.map((panel) => [panel.id, panel.api.width])
                  )
                );
                clearTimeout(timer);
                timer = setTimeout(save, 150);
              });
              disposeRef.current = () => {
                listener.dispose();
                clearTimeout(timer);
                save();
                apiRef.current = null;
              };
            }}
          />
        </div>
      </LayoutControls.Provider>
    </main>
  );
}
