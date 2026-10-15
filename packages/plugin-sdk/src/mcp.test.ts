import { describe, expect, it } from "vitest";
import * as z from "zod";
import { definePluginMcpCapabilities } from "./mcp";

describe("definePluginMcpCapabilities", () => {
  it("keeps runtime-neutral operation bindings", () => {
    const capabilities = definePluginMcpCapabilities({
      extensionId: "lunaris.example",
      tools: [
        {
          description: "List examples.",
          execution: {
            input: {
              pluginId: { value: "lunaris.example" },
              organizationId: { from: "organizationId" },
            },
            kind: "operation",
            operation: "list_resources",
          },
          inputSchema: z.object({ organizationId: z.string() }),
          name: "example_list",
        },
      ],
    });

    expect(capabilities.tools[0]?.execution.input).toEqual({
      pluginId: { value: "lunaris.example" },
      organizationId: { from: "organizationId" },
    });
  });

  it("keeps runtime-neutral plugin procedures", () => {
    const capabilities = definePluginMcpCapabilities({
      extensionId: "lunaris.example",
      tools: [
        {
          description: "Update an example.",
          execution: {
            kind: "plugin",
            offlineAvailability: "supported",
            operation: "update_example",
            risk: "write",
            scope: "workspace:write",
          },
          inputSchema: z.object({ value: z.string() }),
          name: "example_update",
          outputSchema: z.object({ value: z.string() }),
        },
      ],
    });

    expect(capabilities.tools[0]?.execution).toMatchObject({
      kind: "plugin",
      operation: "update_example",
    });
  });

  it("rejects duplicate and unsafe tool names", () => {
    const tool = {
      description: "List examples.",
      execution: {
        input: {},
        kind: "operation" as const,
        operation: "list_resources",
      },
      inputSchema: z.object({}),
      name: "example_list",
    };

    expect(() =>
      definePluginMcpCapabilities({
        extensionId: "lunaris.example",
        tools: [tool, tool],
      })
    ).toThrow("Duplicate extension MCP tool");
    expect(() =>
      definePluginMcpCapabilities({
        extensionId: "lunaris.example",
        tools: [{ ...tool, name: "Example.List" }],
      })
    ).toThrow("must use lowercase");
  });

  it("rejects unknown and unused input mappings", () => {
    expect(() =>
      definePluginMcpCapabilities({
        extensionId: "lunaris.example",
        tools: [
          {
            description: "List examples.",
            execution: {
              input: { organizationId: { from: "missing" } },
              kind: "operation",
              operation: "list_resources",
            },
            inputSchema: z.object({ organizationId: z.string() }),
            name: "example_list",
          },
        ],
      })
    ).toThrow('maps unknown input "missing"');
    expect(() =>
      definePluginMcpCapabilities({
        extensionId: "lunaris.example",
        tools: [
          {
            description: "List examples.",
            execution: {
              input: {},
              kind: "operation",
              operation: "list_resources",
            },
            inputSchema: z.object({ organizationId: z.string() }),
            name: "example_list",
          },
        ],
      })
    ).toThrow('does not map input "organizationId"');
  });
});
