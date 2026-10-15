import { stripMentionContext } from "./mentions";
import { Button } from "@lunarisapp/ui/components/button";
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  HugeiconsIcon,
  StopIcon,
} from "@lunarisapp/ui/icons";
import {
  type AgentWorkMessage,
  type AgentWorkTextMessage,
  type AgentWorkToolMessage,
  usePlatform,
} from "@repo/platform";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import "./message.css";

function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      className="agent-markdown"
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      skipHtml
      controls={false}
    >
      {text}
    </Streamdown>
  );
}

function ToolOutput({ text }: { text: string }) {
  try {
    const value: unknown = JSON.parse(text);
    return (
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } catch {
    return <Markdown text={text} />;
  }
}

export function ToolCall({
  message,
  awaitingApproval = false,
  onReview,
}: {
  message: AgentWorkToolMessage;
  awaitingApproval?: boolean;
  onReview?: () => void;
}) {
  const { t } = useTranslation();
  const status = message.toolStatus;
  const label = t(
    awaitingApproval
      ? "agentWork.awaitingApproval"
      : `agentWork.${status === "running" ? "working" : status}`,
  );
  return (
    <details className="agent-tool group min-w-0 rounded-md border border-border/70 text-xs">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-1.5 text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {status === "running" && !awaitingApproval ? (
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full border border-current border-t-transparent motion-safe:animate-spin"
          />
        ) : (
          <HugeiconsIcon
            aria-hidden="true"
            className={`size-3.5 shrink-0 ${status === "failed" ? "text-destructive" : ""}`}
            icon={
              status === "failed"
                ? AlertCircleIcon
                : status === "stopped"
                  ? StopIcon
                  : awaitingApproval
                    ? StopIcon
                    : CheckmarkCircle02Icon
            }
          />
        )}
        <span
          className="min-w-0 flex-1 truncate font-medium text-foreground"
          title={message.toolName}
        >
          {message.toolName}
        </span>
        <span className="shrink-0">{label}</span>
        <HugeiconsIcon
          aria-hidden="true"
          className="size-3 shrink-0 -rotate-90 group-open:rotate-0"
          icon={ArrowDown01Icon}
        />
      </summary>
      <div className="space-y-3 border-t px-3 py-2.5">
        {message.toolInput && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground">
              {t("agentWork.toolInput")}
            </p>
            <ToolOutput text={JSON.stringify(message.toolInput)} />
          </div>
        )}
        {message.text && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground">
              {t("agentWork.toolOutput")}
            </p>
            <ToolOutput text={message.text} />
          </div>
        )}
        {awaitingApproval && onReview && (
          <Button size="sm" variant="outline" onClick={onReview}>
            {t("agentWork.reviewChange")}
          </Button>
        )}
        {!message.text && !awaitingApproval && (
          <p className="text-muted-foreground">{label}</p>
        )}
      </div>
    </details>
  );
}

function MessageActions({ message }: { message: AgentWorkMessage }) {
  const { t, i18n } = useTranslation();
  const { clipboard } = usePlatform();
  const [status, setStatus] = useState<"idle" | "copied" | "copyFailed">(
    "idle",
  );
  useEffect(() => {
    if (status === "idle") return;
    const timeout = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timeout);
  }, [status]);
  const date =
    message.timestamp === undefined ? null : new Date(message.timestamp);
  const validDate = date && Number.isFinite(date.getTime()) ? date : null;
  const label = t(`agentWork.${status === "idle" ? "copyMessage" : status}`);
  return (
    <footer className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      {validDate && (
        <time
          dateTime={validDate.toISOString()}
          title={validDate.toLocaleString(i18n?.language)}
        >
          {validDate.toLocaleTimeString(i18n?.language, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      )}
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await clipboard.writeText(message.role === "user" ? stripMentionContext(message.text) : message.text);
            setStatus("copied");
          } catch {
            setStatus("copyFailed");
          }
        }}
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={status === "copied" ? CheckmarkCircle02Icon : Copy01Icon}
        />
      </Button>
      <span
        role="status"
        className={status === "copyFailed" ? "text-destructive" : "sr-only"}
      >
        {status === "idle" ? "" : label}
      </span>
    </footer>
  );
}

export function TranscriptMessage({
  message,
}: {
  message: AgentWorkTextMessage;
}) {
  const { t } = useTranslation();
  if (!message.text.trim()) return null;
  return (
    <article
      aria-label={t(
        message.role === "user" ? "agentWork.you" : "agentWork.assistant",
      )}
      className={
        message.role === "user"
          ? "ms-auto w-fit min-w-0 max-w-[90%] rounded-lg bg-muted/60 px-3 py-2 text-sm leading-6"
          : `min-w-0 text-sm leading-6 ${message.role === "assistant" && message.isError ? "text-destructive" : ""}`
      }
    >
      <Markdown text={message.role === "user" ? stripMentionContext(message.text) : message.text} streaming={message.id === "streaming"} />
      <MessageActions message={message} />
    </article>
  );
}
