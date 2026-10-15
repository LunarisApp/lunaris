import { describe, expect, it } from "bun:test";
import {
  AgentResourceFiltersDto,
  AgentResourceSearchDto,
  AgentUpdateResourceDto,
} from "./agent-control.schema";

describe("agent REST query schemas", () => {
  it("coerces HTTP item pagination limits", () => {
    expect(AgentResourceFiltersDto.parse({ limit: "25" })).toMatchObject({
      limit: 25,
    });
  });

  it("trims and validates organization item searches", () => {
    expect(
      AgentResourceSearchDto.parse({ limit: "25", search: "  plan  " }),
    ).toMatchObject({ limit: 25, search: "plan" });
    expect(() => AgentResourceSearchDto.parse({ search: "   " })).toThrow();
  });

  it("drops document and plugin mutations from item updates", () => {
    expect(
      AgentUpdateResourceDto.parse({
        documentId: "other-document",
        name: "Renamed",
        pluginId: "other-plugin",
      }),
    ).toEqual({ name: "Renamed" });
  });
});
