import { describe, expect, it } from "vitest";
import {
  findMentionTrigger,
  insertMention,
  workspaceResourceToEntityReferenceOption,
  uniqueEntityReferenceOptions,
} from "./entity-references";
import type { ResourceStorageHandles } from "./types";

describe("entity references", () => {
  it("finds and inserts mentions without matching email addresses", () => {
    expect(findMentionTrigger("hello@example", 13)).toBeNull();
    const trigger = findMentionTrigger("Review @lau tomorrow", 11);
    expect(trigger).not.toBeNull();
    expect(insertMention("Review @lau tomorrow", trigger!, "Launch plan")).toEqual(
      {
        caret: 20,
        text: "Review @Launch plan tomorrow",
      }
    );
  });

  it("normalizes and deduplicates resources by stable identity", () => {
    const first = workspaceResourceToEntityReferenceOption(
      {
        name: " Launch plan ",
        parentId: null,
        resourceTypeId: "lunaris.rich-text",
        resourceId: "item_1",
        schemaVersion: 1,
        storage: {
          content: { kind: "yjs", storageId: "storage_1" },
        } as unknown as ResourceStorageHandles,
      },
      { id: "workspace_1", name: "Launch" }
    );

    expect(first).toMatchObject({
      kind: "resource",
      name: "Launch plan",
      reference: {
        resourceId: "item_1",
        workspaceId: "workspace_1",
        type: "workspace-resource",
      },
    });
    expect(
      uniqueEntityReferenceOptions([first, { ...first, name: "Duplicate" }])
    ).toEqual([first]);
  });
});
