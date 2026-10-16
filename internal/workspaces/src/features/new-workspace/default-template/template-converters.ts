import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { blocksToYDoc } from "@blocknote/core/yjs";
import { Doc, encodeStateAsUpdateV2, Map as YMap } from "yjs";

type RichTextTemplate = {
  $root: string;
};

type KanbanTemplate = {
  items: Array<{ id: string; [key: string]: unknown }>;
  properties: Record<string, string>[];
};

type KanbanTaskTemplate = {
  createdById?: string;
  description: string;
};

type ExcalidrawTemplate = {
  elements: Array<{
    el: Record<string, unknown>;
    pos: string;
  }>;
};

function updateToBase64(update: Uint8Array) {
  const output: string[] = [];
  for (const byte of update) {
    output.push(String.fromCharCode(byte));
  }
  return btoa(output.join(""));
}

type InlineText = {
  styles: Record<string, string | boolean>;
  text: string;
  type: "text";
};

function getAttribute(element: Element, name: string, fallback: string) {
  return element.getAttribute(name) ?? fallback;
}

function getTextAlignment(element: Element) {
  const value = element.getAttribute("textAlignment");
  return value === "center" ||
    value === "right" ||
    value === "justify" ||
    value === "left"
    ? value
    : "left";
}

function parseInlineContent(
  node: Node,
  styles: Record<string, string | boolean> = {}
): InlineText[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", text, styles }] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const nextStyles = { ...styles };
  switch (element.tagName.toLowerCase()) {
    case "bold":
      nextStyles.bold = true;
      break;
    case "italic":
      nextStyles.italic = true;
      break;
    case "underline":
      nextStyles.underline = true;
      break;
    case "strike":
      nextStyles.strike = true;
      break;
    case "backgroundcolor":
      nextStyles.backgroundColor = getAttribute(
        element,
        "stringValue",
        "default"
      );
      break;
    case "textcolor":
      nextStyles.textColor = getAttribute(element, "stringValue", "default");
      break;
  }

  return Array.from(element.childNodes).flatMap((child) =>
    parseInlineContent(child, nextStyles)
  );
}

function parseBlockContent(element: Element) {
  return Array.from(element.childNodes).flatMap((child) =>
    parseInlineContent(child)
  );
}

function parseBlockContainer(container: Element): PartialBlock | null {
  const contentElement = Array.from(container.children).find(
    (child) => child.tagName.toLowerCase() !== "blockgroup"
  );
  if (!contentElement) {
    return null;
  }

  const children = Array.from(container.children)
    .filter((child) => child.tagName.toLowerCase() === "blockgroup")
    .flatMap((child) => parseBlockGroup(child));
  const id = container.getAttribute("id") ?? undefined;

  switch (contentElement.tagName.toLowerCase()) {
    case "heading":
      return {
        id,
        type: "heading",
        props: {
          backgroundColor: getAttribute(
            contentElement,
            "backgroundColor",
            "default"
          ),
          isToggleable: contentElement.getAttribute("isToggleable") === "true",
          level: Number(contentElement.getAttribute("level") ?? 1),
          textAlignment: getTextAlignment(contentElement),
          textColor: getAttribute(contentElement, "textColor", "default"),
        },
        content: parseBlockContent(contentElement),
        children,
      };
    case "numberedlistitem":
      return {
        id,
        type: "numberedListItem",
        props: {
          backgroundColor: getAttribute(
            contentElement,
            "backgroundColor",
            "default"
          ),
          textAlignment: getTextAlignment(contentElement),
          textColor: getAttribute(contentElement, "textColor", "default"),
        },
        content: parseBlockContent(contentElement),
        children,
      };
    case "table":
      return {
        id,
        type: "table",
        props: {
          textColor: getAttribute(contentElement, "textColor", "default"),
        },
        content: parseTableContent(contentElement),
        children,
      } as PartialBlock;
    default:
      return {
        id,
        type: "paragraph",
        props: {
          backgroundColor: getAttribute(
            contentElement,
            "backgroundColor",
            "default"
          ),
          textAlignment: getTextAlignment(contentElement),
          textColor: getAttribute(contentElement, "textColor", "default"),
        },
        content: parseBlockContent(contentElement),
        children,
      };
  }
}

function parseTableContent(table: Element) {
  const rows = Array.from(table.children)
    .filter((child) => child.tagName.toLowerCase() === "tablerow")
    .map((row) => ({
      cells: Array.from(row.children)
        .filter((child) => child.tagName.toLowerCase() === "tablecell")
        .map((cell) => ({
          type: "tableCell" as const,
          props: {
            backgroundColor: getAttribute(cell, "backgroundColor", "default"),
            colspan: Number(cell.getAttribute("colspan") ?? 1),
            rowspan: Number(cell.getAttribute("rowspan") ?? 1),
            textAlignment: getTextAlignment(cell),
            textColor: getAttribute(cell, "textColor", "default"),
          },
          content: Array.from(cell.childNodes).flatMap((child) =>
            parseInlineContent(child)
          ),
        })),
    }));
  const columnCount = Math.max(0, ...rows.map((row) => row.cells.length));

  return {
    type: "tableContent" as const,
    columnWidths: Array.from({ length: columnCount }, () => undefined),
    rows,
  };
}

function parseBlockGroup(blockGroup: Element): PartialBlock[] {
  return Array.from(blockGroup.children)
    .filter((child) => child.tagName.toLowerCase() === "blockcontainer")
    .flatMap((child) => {
      const block = parseBlockContainer(child);
      return block ? [block] : [];
    });
}

export function createRichTextTemplateUpdate(template: RichTextTemplate) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(template.$root, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid rich-text template XML");
  }

  const root = Array.from(xml.children).find(
    (child) => child.tagName.toLowerCase() === "blockgroup"
  );
  const blocks = root ? parseBlockGroup(root) : [];
  const editor = BlockNoteEditor.create();
  const doc = blocksToYDoc(editor, blocks, "");
  return updateToBase64(encodeStateAsUpdateV2(doc));
}

function populateMap<T>(map: YMap<T>, record: Record<string, T>) {
  for (const [key, value] of Object.entries(record)) {
    map.set(key, value as T);
  }
}

export function createKanbanTemplateUpdate(template: KanbanTemplate) {
  const doc = new Doc();
  const properties = doc.getArray<YMap<string>>("properties");
  const taskAssignments = doc.getMap<YMap<unknown>>("taskAssignments");
  doc.transact(() => {
    doc.getMap<unknown>("kanbanMeta").set("propertiesInitialized", true);
    for (const property of template.properties) {
      const map = new YMap<string>();
      properties.push([map]);
      populateMap(map, property);
    }
    for (const item of template.items) {
      const assignment = new YMap<unknown>();
      for (const [key, value] of Object.entries(item)) {
        if (key.startsWith("prop_")) {
          assignment.set(key, value);
        }
      }
      taskAssignments.set(item.id, assignment);
    }
  });
  return updateToBase64(encodeStateAsUpdateV2(doc));
}

export function createKanbanTaskTemplateUpdate(template: KanbanTaskTemplate) {
  const doc = new Doc();
  const task = doc.getMap<string>("task");
  doc.transact(() => {
    task.set("description", template.description);
    task.set("createdById", template.createdById ?? "");
  });
  return updateToBase64(encodeStateAsUpdateV2(doc));
}

export function createExcalidrawTemplateUpdate(template: ExcalidrawTemplate) {
  const doc = new Doc();
  const elements = doc.getArray<YMap<unknown>>("elements");
  const orderedElements = [...template.elements].sort((a, b) =>
    a.pos.localeCompare(b.pos)
  );
  doc.transact(() => {
    for (const { el, pos } of orderedElements) {
      const map = new YMap<unknown>();
      elements.push([map]);
      map.set("pos", pos);
      map.set("el", { ...el });
    }
  });
  return updateToBase64(encodeStateAsUpdateV2(doc));
}
