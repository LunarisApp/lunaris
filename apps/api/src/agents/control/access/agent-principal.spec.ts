import { describe, expect, it } from "bun:test";
import { agentOperationIds } from "@repo/agent-contracts";
import { AgentControlController } from "../agent-control.controller";
import { agentOperationId } from "./agent-principal";

describe("agent REST operation IDs", () => {
  it("match every shared control-plane operation", () => {
    const methods = Object.getOwnPropertyNames(AgentControlController.prototype)
      .filter((name) => name !== "constructor")
      .map(agentOperationId)
      .sort();

    expect(methods).toEqual([...agentOperationIds].sort());
  });
});
