import {
  entityReferenceKey,
  type PluginEntityReferenceOption,
} from "@lunarisapp/plugin-sdk";

const MENTION_CONTEXT_START = "<lunaris-workspace-resource-mentions>";
const MENTION_CONTEXT_END = "</lunaris-workspace-resource-mentions>";

export interface ResourceMention extends PluginEntityReferenceOption {
  end: number;
  start: number;
}

/** Retain untouched references; edits inside a mention turn it into plain text. */
export function updateMentions(
  previous: string,
  next: string,
  mentions: ResourceMention[],
  caret = next.length
): ResourceMention[] {
  if (previous === next) {
    return mentions;
  }
  let start = 0;
  while (
    start < Math.min(previous.length, next.length, caret) &&
    previous[start] === next[start]
  ) {
    start++;
  }
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (
    oldEnd > start &&
    newEnd > Math.max(start, caret) &&
    previous[oldEnd - 1] === next[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const offset = next.length - previous.length;
  return mentions.flatMap((mention) => {
    const moved =
      mention.end <= start
        ? mention
        : mention.start >= oldEnd
          ? {
              ...mention,
              start: mention.start + offset,
              end: mention.end + offset,
            }
          : null;
    return moved && hasMention(next, moved) ? [moved] : [];
  });
}

export function buildMentionMessage(
  text: string,
  mentions: ResourceMention[]
): string {
  const unique = [
    ...new Map(
      mentions
        .filter((mention) => hasMention(text, mention))
        .map((mention) => [entityReferenceKey(mention.reference), mention])
    ).values(),
  ];
  const visibleText = text.trim();
  if (unique.length === 0) {
    return visibleText;
  }

  const context = unique.map((mention) => ({
    resourceId:
      mention.reference.type === "workspace-resource"
        ? mention.reference.resourceId
        : null,
    kind: mention.kind,
    name: mention.name,
    resourceTypeId: mention.resourceTypeId,
    workspaceId: mention.reference.workspaceId,
    workspaceName: mention.workspaceName,
    storage: mention.storage,
  }));
  return `${visibleText}\n\n${MENTION_CONTEXT_START}\n${JSON.stringify(context)}\n${MENTION_CONTEXT_END}`;
}

function hasMention(text: string, mention: ResourceMention): boolean {
  return (
    text.slice(mention.start, mention.end) === `@${mention.name}` &&
    (mention.start === 0 || /[\s([{]/u.test(text[mention.start - 1] ?? "")) &&
    (mention.end === text.length ||
      /[\s.,!?;:)\]}]/u.test(text[mention.end] ?? ""))
  );
}

export function stripMentionContext(text: string): string {
  const start = text.lastIndexOf(`\n\n${MENTION_CONTEXT_START}\n`);
  if (start === -1 || !text.endsWith(`\n${MENTION_CONTEXT_END}`)) {
    return text;
  }
  return text.slice(0, start);
}
