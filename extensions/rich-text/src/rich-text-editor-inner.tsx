import type { Awareness } from "y-protocols/awareness";
import { es } from "@blocknote/core/locales";
import {
  useCurrentUser,
  useResourcePresence,
  useWorkspaceResourcesMap,
} from "@lunarisapp/plugin-sdk";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Doc } from "yjs";
import { getResourceName } from "./resource-name";
import { RichTextEditorView } from "./editor";
import { useYjsRichTextEditor } from "./hooks";

const BLOCKNOTE_DICTIONARIES: Record<string, typeof es | undefined> = { es };

export interface RichTextEditorInnerProps {
  awareness?: Awareness | null;
  editable?: boolean;
  resourceId: string;
  theme?: "light" | "dark";
  yDoc: Doc;
}

export function RichTextEditorInner({
  resourceId,
  editable = true,
  yDoc,
  awareness,
  theme,
}: RichTextEditorInnerProps) {
  const { i18n, t } = useTranslation();
  const { user } = useCurrentUser();
  const { self } = useResourcePresence();
  const name =
    user?.name?.trim() ||
    t("extensions.catalog.lunaris.rich-text.presence.collaborator");
  const identity = useMemo(
    () => ({ id: user?.id, name, color: self?.color ?? "#1d4ed8" }),
    [user?.id, name, self?.color],
  );
  const yProvider = useMemo(
    () => (awareness ? { awareness } : undefined),
    [awareness],
  );
  useEffect(() => {
    if (awareness?.getLocalState())
      awareness.setLocalStateField("user", identity);
  }, [awareness, identity]);
  const dictionary = BLOCKNOTE_DICTIONARIES[i18n.language];
  const controller = useYjsRichTextEditor({
    yDoc,
    yProvider,
    user: identity,
    collaboratorLabel: t(
      "extensions.catalog.lunaris.rich-text.presence.collaborator",
    ),
    options: { dictionary },
    deps: [i18n.language],
  });

  const resourcesMap = useWorkspaceResourcesMap();
  const documentName = getResourceName(resourcesMap, resourceId);
  const headingInserted = useRef(false);

  useEffect(() => {
    if (!editable || headingInserted.current || !documentName) return;

    const blocks = controller.document;
    const firstBlock = blocks[0];
    if (!firstBlock) return;
    const isEmpty =
      blocks.length === 1 &&
      firstBlock.type === "paragraph" &&
      Array.isArray(firstBlock.content) &&
      firstBlock.content.length === 0;

    if (!isEmpty) {
      headingInserted.current = true;
      return;
    }

    controller.replaceBlocks(
      [firstBlock.id],
      [
        {
          type: "heading",
          props: { level: 1 },
          content: documentName,
        },
        { type: "paragraph" },
      ]
    );
    headingInserted.current = true;
  }, [documentName, controller, editable]);

  return (
    <RichTextEditorView
      className="min-h-full p-3.5"
      controller={controller}
      editable={editable}
      theme={theme}
    />
  );
}
