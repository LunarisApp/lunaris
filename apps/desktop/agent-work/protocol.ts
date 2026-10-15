import {
  agentWorkCommandSchema,
  agentWorkStateSchema,
} from "@repo/platform/agent-work";
import * as z from "zod";

/** Private line protocol shared by the native bridge and bundled Pi runtime. */
export const runtimeCommandSchema = z.union([
  z.intersection(agentWorkCommandSchema, z.object({ id: z.string() })),
  z.object({
    type: z.literal("tool_result"),
    id: z.string(),
    toolCallId: z.string(),
    result: z.unknown(),
    error: z.boolean(),
  }),
]);
export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;

export const runtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("response"),
    id: z.string(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("state"), state: agentWorkStateSchema }),
  z.object({
    type: z.literal("auth"),
    url: z.string().optional(),
    message: z.string().optional(),
    prompt: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("tool_request"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal("tool_done"), id: z.string() }),
]);
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
