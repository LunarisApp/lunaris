import * as z from "zod";
import { agentOperationContracts } from "./contracts";
import { agentOperationDescriptions } from "./descriptions";

export const agentChatToolNames = {
  getYjsStorageJson: "get_yjs_storage_json",
  searchResources: "search_resources",
} as const;

export const agentChatCodemodeToolName = "codemode";

export const agentChatCodemodeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe("JavaScript async arrow function to execute"),
});

export const agentChatCodemodeOutputSchema = z.object({
  logs: z.array(z.string()).optional(),
  result: z.unknown(),
});

export const AGENT_CHAT_CODEMODE_DESCRIPTION = `
Execute sandboxed JavaScript to read Lunaris organization content. Use this when Lunaris content is needed, including one-tool reads.

Available:
type SearchResourcesInput = {
  cursor?: string;
  limit?: number;
  workspaceId?: string;
  search: string;
};
type SearchResourcesOutput = {
  items: Array<{
    id: string;
    name: string;
    workspaceId: string;
    workspaceName: string;
    storage: Record<string, { kind: "file" | "key-value" | "yjs"; storageId: string }>;
  }>;
  nextCursor: string | null;
};
type GetYjsStorageJsonInput = {
  storageId: string;
  workspaceId?: string;
};
type GetYjsStorageJsonOutput = {
  resourceId: string;
  data: Record<string, unknown>;
  storageId: string;
  revision: string;
  updatedAt: string;
};

declare const codemode: {
  /** ${agentOperationDescriptions.search_resources} */
  search_resources(input: SearchResourcesInput): Promise<SearchResourcesOutput>;
  /** ${agentOperationDescriptions.get_yjs_storage_json} */
  get_yjs_storage_json(input: GetYjsStorageJsonInput): Promise<GetYjsStorageJsonOutput>;
};

Write one JavaScript async arrow function that returns a focused result. Do not use TypeScript syntax. Filter and summarize large intermediate results before returning them.
`.trim();

export const agentChatSearchResourcesInputSchema =
  agentOperationContracts.search_resources.input.omit({
    cursor: true,
    organizationId: true,
  });

export const agentChatGetYjsStorageJsonInputSchema =
  agentOperationContracts.get_yjs_storage_json.input
    .pick({
      storageId: true,
      workspaceId: true,
    })
    .extend({
      workspaceId:
        agentOperationContracts.get_yjs_storage_json.input.shape.workspaceId.optional(),
    });
