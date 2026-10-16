import { describe, expect, test } from "bun:test";
import {
  type ExpectedMcpTool,
  type ListedMcpTool,
  validateMcpTools,
} from "./mcp-smoke";

const expectedTools = [
  { name: "list_organizations", offlineAvailability: "supported" },
  { name: "update_organization", offlineAvailability: "cloud-required" },
  {
    name: "kanban_list_boards",
    offlineAvailability: "supported",
    pluginId: "lunaris.kanban",
  },
] satisfies ExpectedMcpTool[];

function listedTool(tool: ExpectedMcpTool): ListedMcpTool {
  return {
    _meta: {
      "app.lunaris/offlineAvailability": tool.offlineAvailability,
      ...(tool.pluginId
        ? { "app.lunaris/pluginId": tool.pluginId }
        : undefined),
    },
    name: tool.name,
  };
}

describe("validateMcpTools", () => {
  test("accepts the generated tool set regardless of order", () => {
    const listedTools = expectedTools.map(listedTool).reverse();

    expect(() => validateMcpTools(listedTools, expectedTools)).not.toThrow();
  });

  test("reports missing and extra tools compactly", () => {
    const listedTools = expectedTools.slice(1).map(listedTool);
    listedTools.push({
      _meta: { "app.lunaris/offlineAvailability": "supported" },
      name: "unexpected_tool",
    });

    expect(() => validateMcpTools(listedTools, expectedTools)).toThrow(
      "missing=[list_organizations]; extra=[unexpected_tool]"
    );
  });

  test("reports offline availability metadata mismatches", () => {
    const listedTools = expectedTools.map(listedTool);
    listedTools[1] = {
      ...listedTools[1]!,
      _meta: { "app.lunaris/offlineAvailability": "supported" },
    };

    expect(() => validateMcpTools(listedTools, expectedTools)).toThrow(
      "update_organization.app.lunaris/offlineAvailability expected=cloud-required actual=supported"
    );
  });

  test("reports plugin metadata mismatches", () => {
    const listedTools = expectedTools.map(listedTool);
    listedTools[2] = {
      ...listedTools[2]!,
      _meta: {
        "app.lunaris/offlineAvailability": "supported",
        "app.lunaris/pluginId": "lunaris.other",
      },
    };

    expect(() => validateMcpTools(listedTools, expectedTools)).toThrow(
      "kanban_list_boards.app.lunaris/pluginId expected=lunaris.kanban actual=lunaris.other"
    );
  });
});
