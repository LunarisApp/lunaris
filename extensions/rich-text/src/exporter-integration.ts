import {
  definePluginService,
  type PluginServiceSlotContribution,
  type SandboxWireObject,
} from "@lunarisapp/plugin-sdk";
import { applyUpdateV2, Doc } from "yjs";
import { extractBlockNoteBlocks } from "./yjs-compile";

interface ExportText {
  marks?: SandboxWireObject;
  text: string;
}

type ExportBlock =
  | { children: ExportText[]; level: 1 | 2 | 3 | 4 | 5 | 6; type: "heading" }
  | { children: ExportText[]; type: "paragraph" }
  | { language?: string; text: string; type: "code" }
  | {
      items: Array<{ blocks: ExportBlock[]; checked?: boolean }>;
      ordered: boolean;
      type: "list";
    }
  | { rows: Array<Array<{ blocks: ExportBlock[] }>>; type: "table" }
  | { alt?: string; caption?: string; source: string; type: "image" };

interface ExportDocument {
  blocks: ExportBlock[];
  title: string;
  version: 1;
}

interface ExportSnapshot {
  children: ExportSnapshot[];
  resource: {
    name: string | null;
    resourceId: string;
    storage: Record<string, { kind: string; storageId: string }>;
  } & SandboxWireObject;
  yjsUpdates: Record<string, string[]>;
}

interface RepresentationMetadata {
  label: string;
  resourceTypeIds: string[];
}

const service = definePluginService({
  id: "lunaris.exporter",
  methods: [],
  version: "0.0.1",
});
const representations = service.slot<
  RepresentationMetadata,
  ExportSnapshot,
  ExportDocument
>("representations");

function textContent(value: unknown): ExportText[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): ExportText[] => {
    if (typeof item === "string") {
      return [{ text: item }];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    const node = item as Record<string, unknown>;
    if (typeof node.text !== "string") {
      return [];
    }
    const styles =
      node.styles && typeof node.styles === "object"
        ? (node.styles as Record<string, unknown>)
        : {};
    const href = node.href;
    const marks = {
      bold: styles.bold === true,
      code: styles.code === true,
      italic: styles.italic === true,
      strike: styles.strike === true,
      underline: styles.underline === true,
      ...(typeof href === "string" ? { link: href } : {}),
    };
    return [
      {
        marks,
        text: node.text,
      },
    ];
  });
}

function paragraph(text: ExportText[]): ExportBlock {
  return { children: text, type: "paragraph" };
}

function convertBlock(value: unknown): ExportBlock[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const block = value as Record<string, unknown>;
  const type = String(block.type ?? "paragraph");
  const content = textContent(block.content);
  const props =
    block.props && typeof block.props === "object"
      ? (block.props as Record<string, unknown>)
      : {};
  if (type === "heading") {
    const level = Math.min(6, Math.max(1, Number(props.level) || 1)) as
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6;
    return [{ children: content, level, type: "heading" }];
  }
  if (type === "codeBlock") {
    return [
      {
        language:
          typeof props.language === "string" ? props.language : undefined,
        text: content.map(({ text }) => text).join(""),
        type: "code",
      },
    ];
  }
  if (
    type === "bulletListItem" ||
    type === "numberedListItem" ||
    type === "checkListItem"
  ) {
    return [
      {
        items: [
          {
            blocks: [
              paragraph(content),
              ...(Array.isArray(block.children) ? block.children : []).flatMap(
                convertBlock
              ),
            ],
            checked:
              type === "checkListItem" ? props.checked === true : undefined,
          },
        ],
        ordered: type === "numberedListItem",
        type: "list",
      },
    ];
  }
  if (type === "image" && typeof props.url === "string") {
    return [
      {
        alt: typeof props.name === "string" ? props.name : undefined,
        caption: typeof props.caption === "string" ? props.caption : undefined,
        source: props.url,
        type: "image",
      },
    ];
  }
  if (type === "table") {
    const rows =
      (block.content as { rows?: Array<{ cells?: unknown[] }> } | undefined)
        ?.rows ?? [];
    return [
      {
        rows: rows.map((row) =>
          (row.cells ?? []).map((cell) => ({
            blocks: [
              paragraph(
                textContent(
                  Array.isArray(cell)
                    ? cell
                    : (cell as { content?: unknown })?.content
                )
              ),
            ],
          }))
        ),
        type: "table",
      },
    ];
  }
  return [
    paragraph(content),
    ...(Array.isArray(block.children) ? block.children : []).flatMap(
      convertBlock
    ),
  ];
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export const richTextExporterRepresentation: PluginServiceSlotContribution<
  RepresentationMetadata,
  ExportSnapshot,
  ExportDocument
> = {
  id: "lunaris.rich-text.exporter",
  metadata: { label: "Rich Text", resourceTypeIds: ["lunaris.rich-text"] },
  invoke: (snapshot) => {
    const document = new Doc();
    try {
      for (const update of snapshot.yjsUpdates.content ?? []) {
        applyUpdateV2(document, decode(update));
      }
      return {
        blocks: extractBlockNoteBlocks(document).flatMap(convertBlock),
        title: snapshot.resource.name ?? "Untitled",
        version: 1,
      };
    } finally {
      document.destroy();
    }
  },
};

export { representations as richTextExporterRepresentations };
