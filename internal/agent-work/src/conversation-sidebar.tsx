import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Add01Icon,
  ChatGptIcon,
  Chat01Icon,
  HugeiconsIcon,
  Logout03Icon,
  Search01Icon,
} from "@lunarisapp/ui/icons";
import type { AgentWorkState } from "@repo/platform";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ConversationSidebarProps {
  available: boolean;
  busy: boolean;
  onConnect: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  runtimeReady: boolean;
  state: AgentWorkState;
}

export function ConversationSidebar({
  state,
  runtimeReady,
  available,
  busy,
  onNew,
  onOpen,
  onConnect,
}: ConversationSidebarProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const sessions = state.sessions.filter((item) =>
    item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const dateFormat = new Intl.DateTimeFormat(i18n?.language, {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="px-2 pt-2">
        <Button
          className="w-full justify-start"
          disabled={!runtimeReady || busy}
          onClick={onNew}
          variant="ghost"
        >
          <HugeiconsIcon icon={Add01Icon} />
          {t("agentWork.newConversation")}
        </Button>
        {state.sessions.length > 0 && (
          <InputGroup className="mt-3">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={t("agentWork.searchConversations")}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("agentWork.searchConversations")}
              type="search"
              value={search}
            />
          </InputGroup>
        )}
      </div>
      <nav
        aria-label={t("agentWork.conversations")}
        className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {!runtimeReady && available ? (
          <div
            aria-label={t("agentWork.loading")}
            className="space-y-3 p-2"
            role="status"
          >
            <div className="h-3 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-3 w-3/5 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        ) : sessions.length ? (
          sessions.map((item) => {
            const updated = new Date(item.updatedAt);
            return (
              <Button
                variant="ghost"
                aria-current={state.sessionId === item.id ? "page" : undefined}
                className="group mb-1 w-full justify-start text-start"
                disabled={!runtimeReady || busy}
                key={item.id}
                onClick={() => onOpen(item.id)}
                title={item.title}
                type="button"
              >
                <HugeiconsIcon
                  className="size-3.5 shrink-0 text-muted-foreground group-aria-[current=page]:text-foreground"
                  icon={Chat01Icon}
                />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="block min-w-0 flex-1 truncate text-sm leading-5 group-aria-[current=page]:font-semibold">
                    {item.title || t("agentWork.newConversation")}
                  </span>
                  {!Number.isNaN(updated.getTime()) && (
                    <time
                      className="shrink-0 text-muted-foreground text-xs group-aria-[current=page]:text-foreground/75"
                      dateTime={item.updatedAt}
                    >
                      {dateFormat.format(updated)}
                    </time>
                  )}
                </span>
              </Button>
            );
          })
        ) : (
          <p className="px-2 py-3 text-muted-foreground text-xs leading-5">
            {t(search ? "agentWork.noMatches" : "agentWork.noConversations")}
          </p>
        )}
      </nav>
      <footer className="flex shrink-0 items-center gap-2 border-t p-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <HugeiconsIcon
            aria-hidden="true"
            className="size-4 shrink-0"
            icon={ChatGptIcon}
          />
          <span className="font-medium">ChatGPT</span>
          {!!state.authenticated && (
            <span
              className="ms-auto flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
              role="status"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-success"
              />
              <span className="truncate">{t("agentWork.connected")}</span>
            </span>
          )}
        </div>
        <Button
          aria-label={t(
            state.authenticated ? "agentWork.disconnect" : "agentWork.connect"
          )}
          title={t(
            state.authenticated ? "agentWork.disconnect" : "agentWork.connect"
          )}
          className="text-xs"
          disabled={!runtimeReady || busy}
          onClick={onConnect}
          size={state.authenticated ? "icon-sm" : "sm"}
          variant={state.authenticated ? "ghost" : "outline"}
        >
          {state.authenticated ? (
            <HugeiconsIcon aria-hidden="true" icon={Logout03Icon} />
          ) : (
            t("agentWork.connect")
          )}
        </Button>
      </footer>
    </div>
  );
}
