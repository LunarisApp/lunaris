import {
  BlockNoteSchema,
  createInlineContentSpec,
  defaultInlineContentSpecs,
} from "@blocknote/core";

export const ENTITY_REFERENCE_TYPE = "entityReference";

export const entityReferenceInlineConfig = {
  content: "none",
  propSchema: {
    resourceId: { default: "" },
    kind: {
      default: "resource",
      values: ["folder", "resource", "workspace"],
    },
    name: { default: "Untitled" },
    workspaceId: { default: "" },
  },
  type: ENTITY_REFERENCE_TYPE,
} as const;

const HeadlessEntityReferenceInlineSpec = createInlineContentSpec(
  entityReferenceInlineConfig,
  {
    render: (inlineContent) => {
      const element = document.createElement("span");
      element.textContent = `@${inlineContent.props.name}`;
      return { dom: element };
    },
    toExternalHTML: (inlineContent) => {
      const element = document.createElement("span");
      element.dataset.lunarisEntityReference = "";
      element.textContent = `@${inlineContent.props.name}`;
      return { dom: element };
    },
  }
);

export const richTextHeadlessSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [ENTITY_REFERENCE_TYPE]: HeadlessEntityReferenceInlineSpec,
  },
});
