import {
  definePluginService,
  type PluginServiceSlotContribution,
  type SandboxWireObject,
} from "@lunarisapp/plugin-sdk";
import { applyUpdateV2, Doc } from "yjs";
import { KANBAN_TASK_RESOURCE_TYPE_ID } from "./constants";
import { formatPropertyValue, normalizePropertyValue } from "./property-codec";
import { getEffectivePropertyDefinitions } from "./property-state";
import { getPropertyAssignmentKey, getTaskAssignments } from "./task-assignments";

type ExportBlock =
  | { children: Array<{ text: string }>; type: "paragraph" }
  | { rows: Array<Array<{ blocks: ExportBlock[] }>>; type: "table" };
interface ExportDocument { blocks: ExportBlock[]; title: string; version: 1 }
interface ExportSnapshot {
  children: ExportSnapshot[];
  resource: { name: string | null; resourceId: string; resourceTypeId: string } & SandboxWireObject;
  yjsUpdates: Record<string, string[]>;
}
interface RepresentationMetadata { label: string; resourceTypeIds: string[] }

const exporterService = definePluginService({ id: "lunaris.exporter", methods: [], version: "0.0.1" });
export const kanbanExporterRepresentations = exporterService.slot<RepresentationMetadata, ExportSnapshot, ExportDocument>("representations");

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function withSnapshotDocument<T>(snapshot: ExportSnapshot, operation: (resource: Doc) => T): T {
  const document = new Doc();
  try {
    for (const update of snapshot.yjsUpdates.content ?? []) applyUpdateV2(document, decode(update));
    return operation(document);
  } finally {
    document.destroy();
  }
}

const cell = (text: string): { blocks: ExportBlock[] } => ({
  blocks: [{ children: [{ text }], type: "paragraph" }],
});

export const kanbanExporterRepresentation: PluginServiceSlotContribution<RepresentationMetadata, ExportSnapshot, ExportDocument> = {
  id: "lunaris.kanban.exporter",
  metadata: { label: "Kanban", resourceTypeIds: ["lunaris.kanban"] },
  invoke: (snapshot) => {
    const boardData = withSnapshotDocument(snapshot, (document) => {
      const properties = getEffectivePropertyDefinitions(document);
      const assignments = getTaskAssignments(document);
      return {
        properties,
        values: new Map(Array.from(assignments.entries()).map(([taskId, assignment]) => [taskId, Object.fromEntries(assignment.entries())])),
      };
    });
    const tasks = snapshot.children.filter(({ resource }) => resource.resourceTypeId === KANBAN_TASK_RESOURCE_TYPE_ID);
    const rows = [
      ["Name", "Description", ...boardData.properties.map(({ name }) => name)].map(cell),
      ...tasks.map((task) => {
        const description = withSnapshotDocument(task, (document) => document.getMap<string>("task").get("description") ?? "");
        const assignment = boardData.values.get(task.resource.resourceId) ?? {};
        const properties = boardData.properties.map((property) =>
          formatPropertyValue(
            property,
            normalizePropertyValue(property, assignment[getPropertyAssignmentKey(property.id)]),
            { canonicalDates: true, canonicalNumbers: true },
          ),
        );
        return [task.resource.name ?? "", description, ...properties].map(cell);
      }),
    ];
    return {
      blocks: [{ rows, type: "table" }],
      title: snapshot.resource.name ?? "Untitled",
      version: 1,
    };
  },
};
