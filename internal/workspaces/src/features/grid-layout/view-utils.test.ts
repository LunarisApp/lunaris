import { describe, expect, it } from "vitest";
import { LUNARIS_RESOURCE_DND_MIME } from "./dnd";
import {
  hasLunarisResourceMime,
  mapDidDropToTarget,
  positionToDirection,
} from "./view-utils";

describe("view-utils", () => {
  it("detects Lunaris drag payload MIME", () => {
    const event = {
      dataTransfer: {
        types: ["text/plain", LUNARIS_RESOURCE_DND_MIME],
      },
    } as unknown as DragEvent;

    expect(hasLunarisResourceMime(event)).toBe(true);
  });

  it("maps dockview positions to panel directions", () => {
    expect(positionToDirection("top")).toBe("above");
    expect(positionToDirection("bottom")).toBe("below");
    expect(positionToDirection("left")).toBe("left");
    expect(positionToDirection("right")).toBe("right");
    expect(positionToDirection("center")).toBe("within");
  });

  it("maps drop events to open-panel targets", () => {
    expect(
      mapDidDropToTarget({
        group: { id: "group-1" },
        position: "left",
      } as never)
    ).toEqual({
      groupId: "group-1",
      direction: "left",
    });

    expect(
      mapDidDropToTarget({
        group: undefined,
        position: "center",
      } as never)
    ).toEqual({
      direction: "within",
    });
  });
});
