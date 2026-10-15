import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { AgentWorkMessage } from "@repo/platform";

/** Keep tool calls at their original transcript position, with their eventual result. */
export function projectMessages(
  messages: AgentSession["messages"],
  pendingCalls: ReadonlySet<string>,
): AgentWorkMessage[] {
  const results = new Map(
    messages
      .filter((message) => message.role === "toolResult")
      .map((message) => [message.toolCallId, message]),
  );
  const calls = new Set(
    messages.flatMap((message) =>
      message.role === "assistant"
        ? message.content.flatMap((part) =>
            part.type === "toolCall" ? [part.id] : [],
          )
        : [],
    ),
  );
  return messages.flatMap((message, index): AgentWorkMessage[] => {
    if (message.role === "assistant") {
      const projected = message.content.flatMap(
        (part, partIndex): AgentWorkMessage[] => {
          if (part.type === "text")
            return part.text.trim()
              ? [
                  {
                    id: `${index}:${partIndex}`,
                    role: "assistant",
                    timestamp: message.timestamp,
                    text: part.text,
                  },
                ]
              : [];
          if (part.type !== "toolCall") return [];
          const result = results.get(part.id);
          return [
            {
              id: `tool:${part.id}`,
              role: "tool",
              timestamp: message.timestamp,
              toolCallId: part.id,
              toolName: part.name,
              toolInput: part.arguments,
              toolStatus: result
                ? result.isError
                  ? "failed"
                  : "completed"
                : pendingCalls.has(part.id)
                  ? "running"
                  : "stopped",
              isError: result?.isError,
              text:
                result?.content
                  .flatMap((block) =>
                    block.type === "text" ? [block.text] : [],
                  )
                  .join("\n") ?? "",
            },
          ];
        },
      );
      if (message.errorMessage)
        projected.push({
          id: `${index}:error`,
          role: "assistant",
          timestamp: message.timestamp,
          text: message.errorMessage,
          isError: true,
        });
      return projected;
    }
    if (message.role === "toolResult" && calls.has(message.toolCallId))
      return [];
    if (message.role !== "user" && message.role !== "toolResult") return [];
    const text =
      typeof message.content === "string"
        ? message.content
        : message.content
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("\n");
    const common = { id: String(index), timestamp: message.timestamp, text };
    if (message.role === "user") return [{ ...common, role: "user" }];
    return [
      {
        ...common,
        role: "tool",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        isError: message.isError,
        toolStatus: message.isError ? "failed" : "completed",
      },
    ];
  });
}
