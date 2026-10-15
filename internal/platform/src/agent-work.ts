import * as z from "zod";

export interface AgentWorkScope {
  apiUrl: string;
  organizationId: string;
  userId: string;
}

const messageFields = {
  id: z.string(),
  text: z.string(),
  timestamp: z.number().optional(),
};

export const agentWorkMessageSchema = z.discriminatedUnion("role", [
  z.object({ ...messageFields, role: z.literal("user") }),
  z.object({
    ...messageFields,
    role: z.literal("assistant"),
    isError: z.boolean().optional(),
  }),
  z.object({
    ...messageFields,
    role: z.literal("tool"),
    toolCallId: z.string(),
    toolName: z.string(),
    toolStatus: z.enum(["running", "completed", "failed", "stopped"]),
    toolInput: z.record(z.string(), z.unknown()).optional(),
    isError: z.boolean().optional(),
  }),
]);
export type AgentWorkMessage = z.infer<typeof agentWorkMessageSchema>;
export type AgentWorkToolMessage = Extract<AgentWorkMessage, { role: "tool" }>;
export type AgentWorkTextMessage = Exclude<
  AgentWorkMessage,
  AgentWorkToolMessage
>;

export const agentWorkStateSchema = z.object({
  busy: z.boolean(),
  authenticated: z.boolean(),
  messages: z.array(agentWorkMessageSchema),
  modelId: z.string(),
  models: z.array(z.object({ id: z.string(), name: z.string() })),
  sessionId: z.string().nullable(),
  sessions: z.array(
    z.object({ id: z.string(), title: z.string(), updatedAt: z.string() }),
  ),
});
export type AgentWorkState = z.infer<typeof agentWorkStateSchema>;

export const agentWorkCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status") }),
  z.object({ type: z.literal("new_session") }),
  z.object({ type: z.literal("login") }),
  z.object({ type: z.literal("logout") }),
  z.object({ type: z.literal("abort") }),
  z.object({ type: z.literal("open_session"), sessionId: z.string() }),
  z.object({
    type: z.literal("prompt"),
    text: z.string().trim().min(1).max(100_000),
    modelId: z.string(),
  }),
  z.object({
    type: z.literal("auth_input"),
    value: z.string().min(1).max(10_000),
  }),
]);
export type AgentWorkCommand = z.infer<typeof agentWorkCommandSchema>;

export interface AgentWorkApproval {
  id: string;
  input: Record<string, unknown>;
  name: string;
}

export type AgentWorkEvent =
  | { type: "disconnected"; message: string }
  | { type: "state"; state: AgentWorkState }
  | { type: "approval"; approval: AgentWorkApproval }
  | { type: "approval_done"; id: string }
  | { type: "auth"; url?: string; message?: string; prompt?: string }
  | { type: "error"; message: string };

export interface AgentWorkConnection {
  close(): Promise<void>;
  request(command: AgentWorkCommand): Promise<void>;
  resolveTool(id: string, approved: boolean): Promise<void>;
}

export interface AgentWorkManager {
  connect(
    scope: AgentWorkScope,
    listener: (event: AgentWorkEvent) => void,
  ): Promise<AgentWorkConnection>;
}
