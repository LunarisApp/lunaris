import { TextStats } from "@lunarisapp/stats";
import { useEffect, useMemo, useState } from "react";
import type { Doc } from "yjs";
import { richTextDocToPlainText } from "./plain-text";

const EDIT_STATS_DEBOUNCE_MS = 250;
const INITIAL_STATS_FALLBACK_MS = 0;

export interface RichTextStats {
  chars: number;
  words: number;
}

/** Calculates initial counts during idle time, then debounces edit updates. */
export function useRichTextStats(yDoc: Doc): RichTextStats | null {
  const [counts, setCounts] = useState<RichTextStats | null>(null);
  const textStats = useMemo(() => new TextStats({ cache: true }), []);

  useEffect(() => {
    const fragment = yDoc.getXmlFragment();
    let editTimer: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;
    const calculate = () => {
      const plainText = richTextDocToPlainText(yDoc);
      setCounts({
        chars: textStats.charCount(plainText),
        words: textStats.wordCount(plainText),
      });
    };
    const handleUpdate = () => {
      if (editTimer) clearTimeout(editTimer);
      editTimer = setTimeout(calculate, EDIT_STATS_DEBOUNCE_MS);
    };

    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(calculate);
    } else {
      editTimer = setTimeout(calculate, INITIAL_STATS_FALLBACK_MS);
    }

    fragment.observeDeep(handleUpdate);
    return () => {
      fragment.unobserveDeep(handleUpdate);
      if (editTimer) clearTimeout(editTimer);
      if (
        idleId !== undefined &&
        typeof cancelIdleCallback === "function"
      ) {
        cancelIdleCallback(idleId);
      }
    };
  }, [textStats, yDoc]);

  return counts;
}
