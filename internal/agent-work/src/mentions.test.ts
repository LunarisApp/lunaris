import {
  findMentionTrigger,
  insertMention,
  type PluginResource,
  type PluginEntityReferenceOption,
  workspaceResourceToEntityReferenceOption,
  workspaceToEntityReferenceOption,
  searchResultToEntityReferenceOption,
  uniqueEntityReferenceOptions,
} from "@lunarisapp/plugin-sdk";
import { describe, expect, it } from "vitest";
import { buildMentionMessage, stripMentionContext, updateMentions } from "./mentions";

const ITEM: PluginResource = {
  name: "Launch plan",
  parentId: null,
  resourceTypeId: "lunaris.rich-text",
  resourceId: "item_1",
  schemaVersion: 1,
  storage: { content: { kind: "yjs", storageId: "doc_1" } },
};
const OPTION = workspaceResourceToEntityReferenceOption(ITEM, {
  id: "workspace_1",
  name: "Launch",
});

const at = (option: PluginEntityReferenceOption, start: number) => ({
  ...option, start, end: start + option.name.length + 1,
});

describe("Agent Work resource mentions", () => {
  it("finds a mention at the caret", () => {
    expect(findMentionTrigger("Review @lau", 11)).toEqual({
      end: 11,
      query: "lau",
      start: 7,
    });
  });

  it("does not treat email addresses as mentions", () => {
    expect(findMentionTrigger("hello@example", 13)).toBeNull();
  });

  it("inserts a selected mention and returns the next caret", () => {
    const trigger = findMentionTrigger("Review @lau tomorrow", 11);
    expect(trigger).not.toBeNull();

    expect(insertMention("Review @lau tomorrow", trigger!, ITEM.name!)).toEqual({
      caret: 20,
      text: "Review @Launch plan tomorrow",
    });
  });

  it("adds exact item context for the model and hides it from chat UI", () => {
    const visible = "Summarize @Launch plan";
    const message = buildMentionMessage(visible, [
      at(OPTION, 10),
    ]);

    expect(message).toContain('"resourceId":"item_1"');
    expect(message).toContain('"resourceId":"item_1"');
    expect(message).toContain('"workspaceId":"workspace_1"');
    expect(message).toContain('"kind":"resource"');
    expect(stripMentionContext(message)).toBe(visible);
  });

  it("drops stale and duplicate mention context", () => {
    const mention = at(OPTION, 0);

    expect(buildMentionMessage("@Launch planner", [mention])).toBe(
      "@Launch planner"
    );
    expect(
      buildMentionMessage("@Launch plan", [mention, mention]).match(
        /"resourceId":"item_1"/gu
      )
    ).toHaveLength(1);
  });

  it("converts organization search results to mention options", () => {
    expect(
      searchResultToEntityReferenceOption({
        name: " Roadmap ",
        parentId: null,
        resourceTypeId: "lunaris.rich-text",
        resourceId: "item_2",
        schemaVersion: 1,
        workspaceId: "workspace_2",
        workspaceName: "Product",
        storage: { content: { kind: "yjs", storageId: "storage_2" } },
      })
    ).toMatchObject({
      kind: "resource",
      name: "Roadmap",
      resourceTypeId: "lunaris.rich-text",
      workspaceName: "Product",
    });
  });

  it("converts workspaces to mention options and exact model context", () => {
    const workspace = workspaceToEntityReferenceOption({
      id: "workspace_2",
      name: " Product ",
    });

    expect(workspace).toMatchObject({
      kind: "workspace",
      name: "Product",
      resourceTypeId: null,
      workspaceName: "Product",
    });
    expect(
      buildMentionMessage("Review @Product", [at(workspace, 7)])
    ).toContain('"resourceId":null,"kind":"workspace"');
  });

  it("marks folder options in model context", () => {
    const folder = workspaceResourceToEntityReferenceOption(
      {
        name: "Planning",
        parentId: null,
        resourceTypeId: "lunaris.folder",
        resourceId: "folder_1",
        schemaVersion: 1,
        storage: {},
      },
      { id: "workspace_1", name: "Launch" }
    );

    expect(folder.kind).toBe("folder");
    expect(
      buildMentionMessage("Open @Planning", [at(folder, 5)])
    ).toContain('"resourceId":"folder_1","kind":"folder"');
  });

  it("keeps the first result while deduplicating mention options", () => {
    const organizationResult = { ...OPTION, name: "Organization result" };
    const localFallback = { ...OPTION, name: "Local fallback" };
    const otherWorkspace = {
      ...OPTION,
      workspaceName: "Product",
      reference: {
        ...OPTION.reference,
        workspaceId: "workspace_2",
      },
    };

    expect(
      uniqueEntityReferenceOptions([organizationResult, localFallback, otherWorkspace])
    ).toEqual([organizationResult, otherWorkspace]);
  });
});

it("shifts references when text is inserted before them", () => {
  const mentions = updateMentions("@Launch plan", "Review @Launch plan", [at(OPTION, 0)], 7);
  expect(mentions[0]?.start).toBe(7);
  expect(buildMentionMessage("Review @Launch plan", mentions)).toContain('"resourceId":"item_1"');
});

it("drops references when editing names, including extending a multiword title", () => {
  expect(updateMentions("@Launch plan", "@Launch plan draft", [at(OPTION, 0)], 18)).toHaveLength(1);
  expect(updateMentions("@Launch plan", "@Launch planner", [at(OPTION, 0)], 15)).toEqual([]);
  expect(updateMentions("@Launch plan", "@Other plan", [at(OPTION, 0)], 6)).toEqual([]);
});

it("keeps only the remaining occurrence when deleting one of two identical titles", () => {
  const other = { ...OPTION, reference: { type: "workspace-resource" as const, resourceId: "other", workspaceId: "other-workspace" } };
  const text = "@Launch plan @Launch plan";
  const mentions = updateMentions(text, "@Launch plan", [at(OPTION, 0), at(other, 13)], 0);
  expect(mentions).toEqual([at(other, 0)]);
  expect(buildMentionMessage("@Launch plan", mentions)).not.toContain('"resourceId":"item_1"');
});
