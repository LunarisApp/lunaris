import {
  useYArray as useYArrayBase,
  useYMapField,
  useYMapJson,
} from "@lunarisapp/plugin-sdk/data";
import { useEffect, useState } from "react";
import type { Doc } from "yjs";
import { getTaskAssignments } from "./task-assignments";

export { useYMapField, useYMapJson };

/** Board always needs deep observation for nested YMap mutations. */
export function useYArray(yDoc: Doc, arrayName: string) {
  return useYArrayBase(yDoc, arrayName, { deep: true });
}

export function useTaskAssignments(yDoc: Doc) {
  const assignments = getTaskAssignments(yDoc);
  const [, setRevision] = useState(0);

  useEffect(() => {
    const handleChange = () => setRevision((revision) => revision + 1);
    assignments.observeDeep(handleChange);
    return () => assignments.unobserveDeep(handleChange);
  }, [assignments]);

  return assignments;
}
