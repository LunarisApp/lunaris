import {
  BlockNoteSchema,
  createInlineContentSpec,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";

export const ENTITY_REFERENCE_TYPE = "entityReference";

export const entityReferenceInlineConfig = {
  content: "none",
  propSchema: {
    resourceId: { default: "" },
    embed: { default: false },
    storageId: { default: "" },
    width: { default: 0 },
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

const codeStyle = defaultStyleSpecs.code;

export const richTextStyles = {
  code: {
    ...codeStyle,
    implementation: {
      // Preserve inline code combined with other styles in existing resources.
      mark: codeStyle.implementation.mark.extend({ excludes: "code" }),
      render: (
        _value: string,
        editor: Parameters<typeof codeStyle.implementation.render>[1]
      ) => codeStyle.implementation.render(undefined, editor),
      toExternalHTML: (
        _value: string,
        editor: Parameters<typeof codeStyle.implementation.render>[1]
      ) =>
        (
          codeStyle.implementation.toExternalHTML ??
          codeStyle.implementation.render
        )(undefined, editor),
    },
  },
};

export const richTextHeadlessSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [ENTITY_REFERENCE_TYPE]: HeadlessEntityReferenceInlineSpec,
  },
}).extend({ styleSpecs: richTextStyles });
