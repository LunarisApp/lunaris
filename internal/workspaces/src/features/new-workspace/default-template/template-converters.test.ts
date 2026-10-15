/** @vitest-environment happy-dom */

import { BlockNoteEditor } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import { describe, expect, it } from "vitest";
import { applyUpdateV2, Doc, type Map as YMap } from "yjs";
import {
  createExcalidrawTemplateUpdate,
  createKanbanTaskTemplateUpdate,
  createKanbanTemplateUpdate,
  createRichTextTemplateUpdate,
} from "./template-converters";

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

describe("default template converters", () => {
  it("creates BlockNote-readable rich-text Yjs updates", () => {
    const update = createRichTextTemplateUpdate({
      $root:
        '<blockgroup><blockcontainer id="a"><heading backgroundColor="default" isToggleable="false" level="1" textAlignment="left" textColor="default">Hello</heading></blockcontainer><blockcontainer id="b"><paragraph backgroundColor="default" textAlignment="left" textColor="default">Body <bold>text</bold></paragraph></blockcontainer><blockcontainer id="c"><table textColor="default"><tablerow><tablecell backgroundColor="default" colspan="1" rowspan="1" textAlignment="left" textColor="default"><tableparagraph>A</tableparagraph></tablecell></tablerow></table></blockcontainer></blockgroup>',
    });
    const doc = new Doc();
    applyUpdateV2(doc, decodeBase64(update));
    const blocks = yXmlFragmentToBlocks(
      BlockNoteEditor.create(),
      doc.getXmlFragment()
    );

    expect(decodeBase64(update).byteLength).toBeGreaterThan(0);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.content).toEqual([
      { type: "text", text: "Hello", styles: {} },
    ]);
    expect(blocks[1]?.content).toEqual([
      { type: "text", text: "Body ", styles: {} },
      { type: "text", text: "text", styles: { bold: true } },
    ]);
    expect(blocks[2]?.type).toBe("table");
  });

  it("creates kanban properties and task assignments", () => {
    const update = createKanbanTemplateUpdate({
      properties: [{ id: "status", name: "Status", type: "select", options: "[]" }],
      items: [
        {
          id: "item_1",
          name: "Task",
          createdAt: "now",
          prop_estimate: 3,
          prop_status: "todo",
        },
      ],
    });
    const doc = new Doc();
    applyUpdateV2(doc, decodeBase64(update));

    expect(decodeBase64(update).byteLength).toBeGreaterThan(0);
    expect(doc.getArray<YMap<string>>("properties")).toHaveLength(1);
    expect(
      doc.getMap<unknown>("kanbanMeta").get("propertiesInitialized")
    ).toBe(true);
    expect(
      doc
        .getMap<YMap<string>>("taskAssignments")
        .get("item_1")
        ?.get("prop_status")
    ).toBe("todo");
    expect(
      doc
        .getMap<YMap<unknown>>("taskAssignments")
        .get("item_1")
        ?.get("prop_estimate")
    ).toBe(3);
  });

  it("creates kanban task details", () => {
    const update = createKanbanTaskTemplateUpdate({
      description: "Prepare launch assets.",
    });
    const doc = new Doc();
    applyUpdateV2(doc, decodeBase64(update));

    expect(doc.getMap<string>("task").toJSON()).toEqual({
      createdById: "",
      description: "Prepare launch assets.",
    });
  });

  it("creates y-excalidraw-readable excalidraw Yjs updates", () => {
    const update = createExcalidrawTemplateUpdate({
      elements: [
        {
          pos: "a0",
          el: { id: "rect_1", type: "rectangle", x: 1, y: 2 },
        },
      ],
    });
    const doc = new Doc();
    applyUpdateV2(doc, decodeBase64(update));
    const elements = doc
      .getArray<YMap<unknown>>("elements")
      .toArray()
      .map((element) => element.get("el"));

    expect(decodeBase64(update).byteLength).toBeGreaterThan(0);
    expect(elements).toEqual([
      expect.objectContaining({ id: "rect_1", type: "rectangle" }),
    ]);
  });
});
