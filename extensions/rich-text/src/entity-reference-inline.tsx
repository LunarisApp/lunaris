import {
  entityReferenceKey,
  type PluginEntityReferenceOption,
  useEntityReferenceSearch,
  useOrganizationNavigation,
} from "@lunarisapp/plugin-sdk";
import {
  BlockNoteSchema,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import {
  createReactInlineContentSpec,
  SuggestionMenuController,
  type SuggestionMenuProps,
} from "@blocknote/react";
import { Kbd, KbdGroup } from "@lunarisapp/ui/components/kbd";
import {
  AtSignIcon,
  File01Icon,
  Folder01Icon,
  FoldersIcon,
  HugeiconsIcon,
  Loading03Icon,
} from "@lunarisapp/ui/icons";
import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ENTITY_REFERENCE_TYPE,
  entityReferenceInlineConfig,
} from "./entity-reference-schema";

export interface EntityReferenceInlineProps {
  kind: "folder" | "resource" | "workspace";
  name: string;
  resourceId: string;
  workspaceId: string;
}

const MENTION_TRANSLATION_KEY =
  "extensions.catalog.lunaris.rich-text.mentions";

function entityReferenceIcon(kind: EntityReferenceInlineProps["kind"]) {
  if (kind === "workspace") return FoldersIcon;
  if (kind === "folder") return Folder01Icon;
  return File01Icon;
}

export function entityReferenceOptionToInlineContent(
  option: PluginEntityReferenceOption
) {
  return {
    props: {
      resourceId:
        option.reference.type === "workspace-resource"
          ? option.reference.resourceId
          : "",
      kind: option.kind,
      name: option.name,
      workspaceId: option.reference.workspaceId,
    },
    type: ENTITY_REFERENCE_TYPE,
  } as const;
}

export function EntityReferenceInlineContent({
  inlineContent,
}: {
  inlineContent: { props: EntityReferenceInlineProps };
}) {
  const navigation = useOrganizationNavigation();
  const props = inlineContent.props;
  const activate = useCallback(() => {
    void navigation.openEntityReference(
      props.kind === "workspace"
        ? { workspaceId: props.workspaceId, type: "workspace" }
        : {
            resourceId: props.resourceId,
            workspaceId: props.workspaceId,
            type: "workspace-resource",
          }
    );
  }, [navigation, props.resourceId, props.kind, props.workspaceId]);
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    },
    [activate]
  );

  return (
    <button
      className="entity-reference-inline"
      contentEditable={false}
      data-entity-reference-kind={props.kind}
      onClick={handleClick}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="entity-reference-inline__icon"
        icon={entityReferenceIcon(props.kind)}
      />
      <span className="entity-reference-inline__label">{props.name}</span>
    </button>
  );
}

const EntityReferenceInlineSpec = createReactInlineContentSpec(
  entityReferenceInlineConfig,
  {
    render: EntityReferenceInlineContent,
    toExternalHTML: ({ inlineContent }) => (
      <span data-lunaris-entity-reference="">
        @{inlineContent.props.name}
      </span>
    ),
  }
);

export const richTextSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [ENTITY_REFERENCE_TYPE]: EntityReferenceInlineSpec,
  },
});

export type RichTextEditorController = typeof richTextSchema.BlockNoteEditor;

export function entityReferenceOptionToSuggestionItem(
  controller: RichTextEditorController,
  option: PluginEntityReferenceOption
) {
  return {
    onItemClick: () => {
      controller.insertInlineContent([
        entityReferenceOptionToInlineContent(option),
        " ",
      ]);
    },
    title: option.name,
    option,
  };
}

export type EntityReferenceSuggestionItem = ReturnType<
  typeof entityReferenceOptionToSuggestionItem
>;

function shouldOpenEntityReferenceMenu(transaction: {
  selection: {
    $from: {
      parent: { textBetween: (from: number, to: number) => string };
      parentOffset: number;
    };
  };
}): boolean {
  const { $from } = transaction.selection;
  if ($from.parentOffset === 0) return true;
  const previous = $from.parent.textBetween(
    $from.parentOffset - 1,
    $from.parentOffset
  );
  return /[\s([{]/u.test(previous);
}

function SuggestionMenuLoading({ label }: { label: string }) {
  return (
    <div
      className="entity-reference-suggestion__loading"
      role="status"
    >
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((index) => (
        <div
          aria-hidden="true"
          className="entity-reference-suggestion__loading-row"
          key={index}
        >
          <span className="entity-reference-suggestion__loading-icon" />
          <span className="entity-reference-suggestion__loading-copy">
            <span className="entity-reference-suggestion__loading-title" />
            <span className="entity-reference-suggestion__loading-subtitle" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function EntityReferenceSuggestionMenuContent({
  items,
  loadingState,
  onItemClick,
  selectedIndex,
}: SuggestionMenuProps<EntityReferenceSuggestionItem>) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const isLoading =
    loadingState === "loading" || loadingState === "loading-initial";

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div
      aria-busy={isLoading}
      aria-label={t(`${MENTION_TRANSLATION_KEY}.ariaLabel`)}
      className="entity-reference-suggestion"
      id="bn-suggestion-menu"
      role="listbox"
    >
      <div className="entity-reference-suggestion__header">
        <span className="entity-reference-suggestion__header-icon">
          <HugeiconsIcon aria-hidden="true" icon={AtSignIcon} />
        </span>
        <span className="entity-reference-suggestion__header-copy">
          <span className="entity-reference-suggestion__title">
            {t(`${MENTION_TRANSLATION_KEY}.title`)}
          </span>
          <span className="entity-reference-suggestion__description">
            {t(`${MENTION_TRANSLATION_KEY}.description`)}
          </span>
        </span>
        {isLoading && items.length > 0 ? (
          <HugeiconsIcon
            aria-label={t(`${MENTION_TRANSLATION_KEY}.searching`)}
            className="entity-reference-suggestion__spinner"
            icon={Loading03Icon}
          />
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="entity-reference-suggestion__list" ref={listRef}>
          {items.map((item, index) => {
            const typeLabel = t(
              `${MENTION_TRANSLATION_KEY}.${item.option.kind}`
            );
            const context =
              item.option.kind === "workspace"
                ? typeLabel
                : `${item.option.workspaceName} · ${typeLabel}`;
            return (
              <div
                aria-selected={index === selectedIndex}
                className="entity-reference-suggestion__item"
                id={`bn-suggestion-menu-item-${index}`}
                key={entityReferenceKey(item.option.reference)}
                onClick={() => onItemClick?.(item)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
              >
                <span
                  className="entity-reference-suggestion__item-icon"
                  data-kind={item.option.kind}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={entityReferenceIcon(item.option.kind)}
                  />
                </span>
                <span className="entity-reference-suggestion__item-copy">
                  <span className="entity-reference-suggestion__item-title">
                    {item.option.name}
                  </span>
                  <span className="entity-reference-suggestion__item-context">
                    {context}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : isLoading ? (
        <SuggestionMenuLoading
          label={t(`${MENTION_TRANSLATION_KEY}.searching`)}
        />
      ) : (
        <div className="entity-reference-suggestion__empty">
          <span className="entity-reference-suggestion__empty-icon">
            <HugeiconsIcon aria-hidden="true" icon={AtSignIcon} />
          </span>
          <span className="entity-reference-suggestion__empty-title">
            {t(`${MENTION_TRANSLATION_KEY}.noResultsTitle`)}
          </span>
          <span className="entity-reference-suggestion__empty-description">
            {t(`${MENTION_TRANSLATION_KEY}.noResultsDescription`)}
          </span>
        </div>
      )}

      <div className="entity-reference-suggestion__footer">
        <span className="entity-reference-suggestion__shortcut">
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </KbdGroup>
          {t(`${MENTION_TRANSLATION_KEY}.navigate`)}
        </span>
        <span className="entity-reference-suggestion__shortcut">
          <Kbd>Enter</Kbd>
          {t(`${MENTION_TRANSLATION_KEY}.select`)}
        </span>
        <span className="entity-reference-suggestion__shortcut">
          <Kbd>Esc</Kbd>
          {t(`${MENTION_TRANSLATION_KEY}.close`)}
        </span>
      </div>
    </div>
  );
}

export function EntityReferenceSuggestionMenu({
  controller,
}: {
  controller: RichTextEditorController;
}) {
  const search = useEntityReferenceSearch();
  const getItems = useCallback(
    async (query: string) => {
      const options = await search(query).catch(() => []);
      return options.map((option) =>
        entityReferenceOptionToSuggestionItem(controller, option)
      );
    },
    [controller, search]
  );

  return (
    <SuggestionMenuController
      getItems={getItems}
      minQueryLength={0}
      suggestionMenuComponent={EntityReferenceSuggestionMenuContent}
      shouldOpen={shouldOpenEntityReferenceMenu}
      triggerCharacter="@"
    />
  );
}
