import type {
  AgentWorkApproval,
  AgentWorkCommand,
  AgentWorkConnection,
  AgentWorkEvent,
  AgentWorkScope,
  AgentWorkState,
} from "@repo/platform";
import { usePlatform } from "@repo/platform";
import { useCallback, useEffect, useRef, useState } from "react";

export const initialAgentWorkState: AgentWorkState = {
  authenticated: false,
  busy: false,
  modelId: "",
  models: [],
  sessionId: null,
  sessions: [],
  messages: [],
};

export function useAgentWork(scope: AgentWorkScope) {
  const { agentWork } = usePlatform();
  const connection = useRef<AgentWorkConnection | null>(null);
  const [state, setState] = useState(initialAgentWorkState);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [error, setError] = useState<string>();
  const [approvals, setApprovals] = useState<AgentWorkApproval[]>([]);
  const [auth, setAuth] = useState<Extract<AgentWorkEvent, { type: "auth" }>>();
  const [revision, setRevision] = useState(0);
  const { apiUrl, organizationId, userId } = scope;

  useEffect(() => {
    if (!agentWork) {
      return;
    }
    let active = true;
    let disconnected = false;
    let current: AgentWorkConnection | undefined;
    setRuntimeReady(false);
    setState(initialAgentWorkState);
    setApprovals([]);
    setAuth(undefined);
    setError(undefined);
    const start = Promise.resolve().then(() =>
      active
        ? agentWork.connect({ apiUrl, organizationId, userId }, (event) => {
            if (!active) {
              return;
            }
            switch (event.type) {
              case "disconnected":
                disconnected = true;
                setRuntimeReady(false);
                setState((current) => ({ ...current, busy: false }));
                setApprovals([]);
                setAuth(undefined);
                setError(event.message);
                break;
              case "state":
                setState(event.state);
                break;
              case "approval":
                setApprovals((pending) => [...pending, event.approval]);
                break;
              case "approval_done":
                setApprovals((pending) =>
                  pending.filter((item) => item.id !== event.id),
                );
                break;
              case "auth":
                setAuth((current) =>
                  event.url || event.prompt || event.message
                    ? { ...current, ...event }
                    : undefined,
                );
                break;
              case "error":
                setError(event.message);
                break;
            }
          })
        : undefined,
    );
    void start
      .then(async (value) => {
        if (!value) {
          return;
        }
        current = value;
        if (!active) {
          await value.close();
          return;
        }
        connection.current = value;
        await value.request({ type: "status" });
        if (active && !disconnected) {
          setRuntimeReady(true);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(String(cause));
        }
      });
    return () => {
      active = false;
      connection.current = null;
      if (current) {
        void current.close().catch(() => undefined);
      }
    };
  }, [agentWork, apiUrl, organizationId, userId, revision]);

  const request = useCallback(async (command: AgentWorkCommand) => {
    setError(undefined);
    try {
      if (!connection.current) {
        throw new Error("Agent Work is not connected");
      }
      await connection.current.request(command);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);
  const resolveTool = async (id: string, approved: boolean) => {
    try {
      await connection.current?.resolveTool(id, approved);
    } catch (cause) {
      setError(String(cause));
    }
  };
  const reconnect = async () => {
    try {
      await connection.current?.close();
      connection.current = null;
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return {
    available: !!agentWork,
    auth,
    approvals,
    error,
    runtimeReady,
    reconnect,
    request,
    resolveTool,
    state,
  };
}
