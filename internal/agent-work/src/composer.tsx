import type { ResourceMention } from "./mentions";
import { findMentionTrigger, insertMention, type PluginEntityReferenceOption, type PluginMentionTrigger } from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import { Textarea } from "@lunarisapp/ui/components/textarea";
import { ArrowUp01Icon, HugeiconsIcon, StopIcon } from "@lunarisapp/ui/icons";
import type { AgentWorkState } from "@repo/platform";
import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

export function AgentComposer({
  id,
  searchMentions,
  onMention,
  inputRef,
  centered,
  draft,
  onDraftChange,
  selectedModel,
  models,
  onModelChange,
  busy,
  runtimeReady,
  authenticated,
  onSend,
  onStop,
}: {
  id: string;
  searchMentions: (query: string, signal: AbortSignal) => Promise<PluginEntityReferenceOption[]>;
  onMention: (mention: ResourceMention) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  centered: boolean;
  draft: string;
  onDraftChange: (value: string, caret?: number) => void;
  selectedModel: string;
  models: AgentWorkState["models"];
  onModelChange: (value: string) => void;
  busy: boolean;
  runtimeReady: boolean;
  authenticated: boolean;
  onSend: () => Promise<void>;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const [trigger, setTrigger] = useState<PluginMentionTrigger | null>(null);
  const [items, setItems] = useState<PluginEntityReferenceOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const query = trigger?.query;
  const open = !!trigger && !!draft;
  const listId = `${id}-mentions`;
  useEffect(() => {
    setItems([]);
    setActiveIndex(0);
    if (query === undefined || !open) return;
    setStatus("loading");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchMentions(query, controller.signal).then((results) => {
        if (controller.signal.aborted) return;
        setItems(results);
        setStatus("ready");
      }).catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, open, searchMentions]);
  const updateTrigger = (input: HTMLTextAreaElement) => {
    const next = input.selectionStart === input.selectionEnd
      ? findMentionTrigger(input.value, input.selectionStart) : null;
    if (next?.query !== trigger?.query) setItems([]);
    setTrigger(next);
    setActiveIndex(0);
  };
  const selectMention = (item: PluginEntityReferenceOption) => {
    if (!trigger) return;
    const next = insertMention(draft, trigger, item.name);
    onDraftChange(next.text, next.caret);
    onMention({ ...item, start: trigger.start, end: trigger.start + item.name.length + 1 });
    setTrigger(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, items, listId]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
  }, [draft, centered]);
  return (
    <form
      className={`mx-auto w-full max-w-4xl shrink-0 ${centered ? "pt-6" : "px-3 pt-2 pb-3 md:px-4"}`}
      onSubmit={(event) => {
        event.preventDefault();
        void onSend();
      }}
    >
      <div className="overflow-hidden rounded-lg border border-border bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        {open && (
          <div className="border-b">
            <div className="px-3 py-2 text-xs text-muted-foreground" role="status">
              {t(status === "error" ? "agentWork.mentionError" : status === "loading" ? "agentWork.mentionLoading" : items.length ? "agentWork.mentionResources" : "agentWork.mentionEmpty")}
            </div>
            <div id={listId} role="listbox" aria-label={t("agentWork.mentionResources")} className="max-h-48 overflow-y-auto p-1">
              {items.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  id={`${listId}-${index}`}
                  key={`${item.reference.workspaceId}:${item.reference.type === "workspace-resource" ? item.reference.resourceId : ""}`}
                  className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm aria-selected:bg-muted"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => selectMention(item)}
                >
                  <span className="w-full truncate">{item.name}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{item.workspaceName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Textarea
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          onBlur={() => setTrigger(null)}
          onSelect={(event) => updateTrigger(event.currentTarget)}
          aria-label={t("agentWork.message")}
          className="max-h-48 min-h-14 resize-none rounded-none border-0 bg-transparent px-3 pt-3 pb-1 shadow-none focus-visible:ring-0 disabled:bg-transparent disabled:opacity-70 dark:bg-transparent dark:disabled:bg-transparent"
          ref={(input) => {
            inputRef.current = input;
            if (input) {
              input.style.height = "auto";
              input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
            }
          }}
          rows={2}
          disabled={!(runtimeReady && authenticated)}
          id={id}
          maxLength={100_000}
          onChange={(event) => { onDraftChange(event.target.value, event.target.selectionStart); updateTrigger(event.currentTarget); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (open) {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setTrigger(null);
                return;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (items.length) setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
                return;
              }
              if (!event.shiftKey && (event.key === "Enter" || event.key === "Tab") && items[activeIndex]) {
                event.preventDefault();
                selectMention(items[activeIndex]);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                return;
              }
            }
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void onSend();
            }
          }}
          placeholder={t("agentWork.placeholder")}
          value={draft}
        />
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <select
            aria-label={t("agentWork.model")}
            className="h-8 max-w-[60%] cursor-pointer rounded-md bg-transparent px-2 text-muted-foreground text-xs outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            disabled={!runtimeReady || busy}
            onChange={(event) => onModelChange(event.target.value)}
            value={selectedModel}
          >
            {!models.length && <option value="">ChatGPT</option>}
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {busy ? (
            <Button
              aria-label={t("agentWork.stop")}
              onClick={() => void onStop()}
              size="icon"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon icon={StopIcon} />
            </Button>
          ) : (
            <Button
              aria-label={t("agentWork.send")}
              disabled={!(runtimeReady && authenticated && draft.trim())}
              size="icon"
              type="submit"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
