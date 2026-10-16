import type { DockviewDidDropEvent, Position } from "dockview";
import { LUNARIS_RESOURCE_DND_MIME } from "./dnd";
import type { OpenPanelTarget } from "./types";

export function isDragEvent(
  event: DragEvent | PointerEvent
): event is DragEvent {
  return "dataTransfer" in event;
}

export function hasLunarisResourceMime(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) {
    return false;
  }

  for (let i = 0; i < types.length; i++) {
    if (types[i] === LUNARIS_RESOURCE_DND_MIME) {
      return true;
    }
  }

  return false;
}

export function positionToDirection(
  position: Position
): OpenPanelTarget["direction"] {
  switch (position) {
    case "top":
      return "above";
    case "bottom":
      return "below";
    case "left":
      return "left";
    case "right":
      return "right";
    default:
      return "within";
  }
}

export function mapDidDropToTarget(
  event: Pick<DockviewDidDropEvent, "group" | "position">
): OpenPanelTarget {
  const direction = positionToDirection(event.position);
  if (event.group) {
    return { groupId: event.group.id, direction };
  }
  return { direction };
}
