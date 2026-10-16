import { BlockNoteEditor } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import type { PluginYjsStorageUpdateRow } from "@lunarisapp/plugin-sdk";
import { applyUpdateV2, Doc } from "yjs";
import { richTextHeadlessSchema } from "./entity-reference-schema";
import { blockListToTextLines } from "./plain-text";

const SESSION_GAP_MS = 2 * 60_000;

export interface RichTextVersionDiffLine {
  kind: "added" | "removed";
  text: string;
}

export interface RichTextVersionHistoryEntry {
  actorId: string | null;
  addedCount: number;
  createdAt: string;
  endedAt: string;
  id: string;
  lines: RichTextVersionDiffLine[];
  removedCount: number;
}

interface ParsedUpdate extends PluginYjsStorageUpdateRow {
  data: Uint8Array;
}

interface UpdateSession {
  actorId: string | null;
  createdAt: string;
  endedAt: string;
  id: string;
  updates: ParsedUpdate[];
}

export function buildRichTextVersionHistory(
  updates: PluginYjsStorageUpdateRow[]
): RichTextVersionHistoryEntry[] {
  if (updates.length === 0) {
    return [];
  }

  const parsedUpdates = updates.map((update) => ({
    ...update,
    data: decodeUpdate(update.updateBase64),
  }));
  const sessions = groupUpdates(parsedUpdates);
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });

  try {
    const currentDoc = new Doc();
    const entries: RichTextVersionHistoryEntry[] = [];
    let beforeLines: string[] = [];

    try {
      for (const session of sessions) {
        for (const update of session.updates) {
          applyUpdateV2(currentDoc, update.data);
        }

        const afterLines = blockListToTextLines(
          yXmlFragmentToBlocks(editor, currentDoc.getXmlFragment())
        );
        const diffLines = buildLineDiff(beforeLines, afterLines);
        beforeLines = afterLines;

        if (diffLines.length === 0) {
          continue;
        }

        const addedCount = diffLines.filter(
          (line) => line.kind === "added"
        ).length;
        entries.push({
          actorId: session.actorId,
          addedCount,
          createdAt: session.createdAt,
          endedAt: session.endedAt,
          id: session.id,
          lines: diffLines,
          removedCount: diffLines.length - addedCount,
        });
      }

      return entries.reverse();
    } finally {
      currentDoc.destroy();
    }
  } finally {
    editor._tiptapEditor?.destroy();
  }
}

function decodeUpdate(updateB64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(updateB64), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("Invalid Yjs update");
  }
}

function groupUpdates(updates: ParsedUpdate[]): UpdateSession[] {
  const sessions: UpdateSession[] = [];

  for (const update of updates) {
    const current = sessions.at(-1);
    if (current && shouldAppendToSession(current, update)) {
      current.updates.push(update);
      current.endedAt = update.createdAt;
      continue;
    }

    sessions.push({
      actorId: update.userId,
      createdAt: update.createdAt,
      endedAt: update.createdAt,
      id: update.id,
      updates: [update],
    });
  }

  return sessions;
}

function shouldAppendToSession(
  session: UpdateSession,
  update: ParsedUpdate
): boolean {
  if (session.actorId !== update.userId) {
    return false;
  }

  const previousTimestamp = Date.parse(session.endedAt);
  const currentTimestamp = Date.parse(update.createdAt);

  if (Number.isNaN(previousTimestamp) || Number.isNaN(currentTimestamp)) {
    return false;
  }

  return currentTimestamp - previousTimestamp <= SESSION_GAP_MS;
}

function buildLineDiff(
  beforeLines: string[],
  afterLines: string[]
): RichTextVersionDiffLine[] {
  const table = Array.from({ length: beforeLines.length + 1 }, () =>
    new Array(afterLines.length + 1).fill(0)
  );

  for (
    let beforeIndex = beforeLines.length - 1;
    beforeIndex >= 0;
    beforeIndex -= 1
  ) {
    for (
      let afterIndex = afterLines.length - 1;
      afterIndex >= 0;
      afterIndex -= 1
    ) {
      table[beforeIndex]![afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? table[beforeIndex + 1]![afterIndex + 1]! + 1
          : Math.max(
              table[beforeIndex + 1]![afterIndex]!,
              table[beforeIndex]![afterIndex + 1]!
            );
    }
  }

  const diff: RichTextVersionDiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (
      table[beforeIndex + 1]![afterIndex]! >=
      table[beforeIndex]![afterIndex + 1]!
    ) {
      diff.push({
        kind: "removed",
        text: beforeLines[beforeIndex]!,
      });
      beforeIndex += 1;
      continue;
    }

    diff.push({
      kind: "added",
      text: afterLines[afterIndex]!,
    });
    afterIndex += 1;
  }

  while (beforeIndex < beforeLines.length) {
    diff.push({
      kind: "removed",
      text: beforeLines[beforeIndex]!,
    });
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    diff.push({
      kind: "added",
      text: afterLines[afterIndex]!,
    });
    afterIndex += 1;
  }

  return diff;
}
