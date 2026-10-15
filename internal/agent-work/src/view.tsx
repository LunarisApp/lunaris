import { buildMentionMessage, updateMentions, type ResourceMention } from "./mentions";
import { useResourceMentionSearch } from "./use-resource-mentions";
import { AgentComposer } from "./composer";
import { AgentAuthForm } from "./auth-form";
import { AgentApprovals } from "./approvals";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import { Button } from "@lunarisapp/ui/components/button";
import { AgentLayout, type AgentLayoutHandle } from "./layout";
import { ConversationSidebar } from "./conversation-sidebar";
import { ArrowDown01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { Appbar } from "@repo/features/appbar";
import type { AgentWorkScope } from "@repo/platform";
import { type ComponentType, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToolCall, TranscriptMessage } from "./message";
import { useAgentWork } from "./use-agent-work";

export type AgentWorkPresentation =
  | { variant: "panel" }
  | {
      variant: "workbench";
      AppBarLeading: ComponentType;
      AppBarTrailing: ComponentType;
    };

export function AgentWorkView(
  props: AgentWorkPresentation & { scope: AgentWorkScope },
) {
  const { scope } = props;
  const embedded = props.variant === "panel";
  const { t } = useTranslation();
  const agent = useAgentWork(scope);
  const composerId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { state } = agent;
  const [draftState, setDraftState] = useState<{ text: string; mentions: ResourceMention[] }>({ text: "", mentions: [] });
  const draft = draftState.text;
  const setDraft = (text: string, caret?: number) => setDraftState((current) => ({
    text,
    mentions: updateMentions(current.text, text, current.mentions, caret),
  }));
  const searchMentions = useResourceMentionSearch(scope.organizationId);
  const [model, setModel] = useState("");
  const layout = useRef<AgentLayoutHandle>(null);
  const reveal = (id: "chat" | "conversations" | "activity") => {
    if (embedded) setPickerOpen(false);
    else layout.current?.reveal(id);
  };
  const [showLatest, setShowLatest] = useState(false);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const busy = state.busy || submitting;
  const selectedModel = model || state.modelId;
  const empty = state.messages.length === 0;
  const centered =
    empty && !agent.auth && !agent.error && !agent.approvals.length;
  const selectConversation = (id?: string) => {
    reveal("chat");
    setDraftState({ text: "", mentions: [] });
    followOutput.current = true;
    setShowLatest(false);
    void agent.request(
      id ? { type: "open_session", sessionId: id } : { type: "new_session" },
    );
  };
  const sidebar = (
    <ConversationSidebar
      state={state}
      runtimeReady={agent.runtimeReady}
      available={agent.available}
      busy={busy}
      onNew={() => selectConversation()}
      onOpen={selectConversation}
      onConnect={() => {
        setPickerOpen(false);
        void agent.request({ type: state.authenticated ? "logout" : "login" });
      }}
    />
  );

  useEffect(() => {
    setModel(state.modelId);
  }, [state.modelId, state.sessionId]);
  useEffect(() => {
    if (followOutput.current && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    }
  }, [state.messages, agent.approvals]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !state.authenticated || !agent.runtimeReady) {
      return;
    }
    setSubmitting(true);
    setDraftState({ text: "", mentions: [] });
    followOutput.current = true;
    const sent = await agent.request({
      type: "prompt",
      text: buildMentionMessage(draftState.text, draftState.mentions),
      modelId: selectedModel,
    });
    if (!sent) {
      setDraftState((current) => current.text ? current : draftState);
    }
    setSubmitting(false);
  };

  const composer = (
    <AgentComposer
      id={composerId}
      searchMentions={searchMentions}
      onMention={(mention) => setDraftState((current) => ({ ...current, mentions: [...current.mentions.filter((item) => item.end <= mention.start || item.start >= mention.end), mention] }))}
      inputRef={composerInput}
      centered={centered}
      draft={draft}
      onDraftChange={setDraft}
      selectedModel={selectedModel}
      models={state.models}
      onModelChange={setModel}
      busy={busy}
      runtimeReady={agent.runtimeReady}
      authenticated={state.authenticated}
      onSend={send}
      onStop={() => void agent.request({ type: "abort" })}
    />
  );

  const approvals = (
    <AgentApprovals approvals={agent.approvals} onResolve={agent.resolveTool} />
  );

  const activity = (
    <aside
      aria-label={t("agentWork.activity")}
      className="h-full overflow-y-auto px-4 pb-4"
    >
      {approvals}

      {!(
        agent.approvals.length ||
        state.messages.some((message) => message.role === "tool")
      ) && (
        <div className="py-8 text-muted-foreground text-sm leading-6">
          <p>{t("agentWork.activityEmpty")}</p>
        </div>
      )}
      <div
        className="mt-3 space-y-2"
        role="log"
        aria-label={t("agentWork.toolResults")}
      >
        {state.messages
          .filter((message) => message.role === "tool")
          .map((message) => (
            <ToolCall
              key={message.id}
              message={message}
              awaitingApproval={agent.approvals.some(
                (approval) => approval.id === message.toolCallId,
              )}
            />
          ))}
      </div>
    </aside>
  );
  const chat = (
    <div className="relative flex h-full min-w-0 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
        tabIndex={0}
        role="region"
        aria-label={t("agentWork.transcript")}
        onScroll={(event) => {
          const node = event.currentTarget;
          followOutput.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          setShowLatest(!followOutput.current);
        }}
        ref={(node) => {
          transcript.current = node;
          if (node && followOutput.current) {
            node.scrollTop = node.scrollHeight;
          }
        }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-3 py-4 md:px-4">
          {!state.messages.length && (
            <div className={`w-full ${centered ? "my-auto py-8" : "py-8"}`}>
              <h3 className="text-center font-medium text-lg">
                {t("agentWork.heading")}
              </h3>
              {(!agent.available || !state.authenticated) && (
                <p className="mx-auto mt-3 max-w-md text-center text-muted-foreground text-sm leading-6">
                  {t(
                    agent.available
                      ? "agentWork.description"
                      : "agentWork.desktopOnly",
                  )}
                </p>
              )}
              {agent.available && !state.authenticated && (
                <Button
                  className="mx-auto mt-5 flex"
                  disabled={!agent.runtimeReady || busy}
                  onClick={() => void agent.request({ type: "login" })}
                >
                  {t("agentWork.connect")}
                </Button>
              )}
              {centered && composer}
            </div>
          )}
          <div
            aria-label={t("agentWork.transcript")}
            className="min-w-0 space-y-4"
            role="log"
          >
            {state.messages.map((message) =>
              message.role === "tool" ? (
                <ToolCall
                  key={message.id}
                  message={message}
                  awaitingApproval={agent.approvals.some(
                    (approval) => approval.id === message.toolCallId,
                  )}
                  onReview={embedded ? undefined : () => reveal("activity")}
                />
              ) : (
                <TranscriptMessage key={message.id} message={message} />
              ),
            )}
          </div>
          {embedded && approvals}
          {busy && (
            <p
              aria-live="polite"
              className="mt-5 flex items-center gap-2 text-muted-foreground text-xs"
            >
              <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" />
              {t(
                agent.approvals.length
                  ? "agentWork.awaitingApproval"
                  : "agentWork.working",
              )}
            </p>
          )}
          {agent.auth && (
            <AgentAuthForm auth={agent.auth} onRequest={agent.request} />
          )}
          {agent.error && (
            <div
              className="mt-4 space-y-2 rounded-lg border border-destructive/50 p-4"
              role="alert"
              aria-label={t("agentWork.error")}
            >
              <p className="text-sm">{agent.error}</p>
              <Button onClick={() => void agent.reconnect()} variant="outline">
                {t("agentWork.reconnect")}
              </Button>
            </div>
          )}
        </div>
      </div>
      {showLatest && !empty && (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center">
          <Button
            className="pointer-events-auto gap-2 rounded-full"
            onClick={() => {
              const node = transcript.current;
              if (node) {
                node.scrollTop = node.scrollHeight;
              }
              followOutput.current = true;
              setShowLatest(false);
            }}
            size="sm"
            variant="outline"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} />
            {t("agentWork.latest")}
          </Button>
        </div>
      )}
      {!centered && composer}
    </div>
  );
  if (props.variant === "panel") {
    const title =
      state.sessions.find((session) => session.id === state.sessionId)?.title ||
      t("agentWork.newConversation");
    return (
      <section
        aria-label={t("editor.agentWork")}
        className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground"
      >
        <header className="flex shrink-0 items-center border-b p-1.5">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-w-0 max-w-full gap-2"
                  aria-label={t("agentWork.conversations")}
                  title={title}
                />
              }
            >
              <span className="truncate">{title}</span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className="size-3.5 shrink-0"
              />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={t("agentWork.conversations")}
              className="h-96 max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
            >
              {sidebar}
            </PopoverContent>
          </Popover>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{chat}</div>
      </section>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-sidebar px-2.5 pb-2.5 text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
        href={`#${composerId}`}
        onClick={(event) => {
          event.preventDefault();
          reveal("chat");
          requestAnimationFrame(() => composerInput.current?.focus());
        }}
      >
        {t("agentWork.skipToMessage")}
      </a>
      <Appbar className="shrink-0">
        <Appbar.Leading>
          <props.AppBarLeading />
        </Appbar.Leading>
        <Appbar.Trailing>
          <props.AppBarTrailing />
        </Appbar.Trailing>
      </Appbar>
      <AgentLayout
        scope={scope}
        ref={layout}
        pending={agent.approvals.length}
        slots={{ conversations: sidebar, chat, activity }}
      />
    </div>
  );
}
