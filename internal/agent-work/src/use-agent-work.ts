import type {
  AgentWorkApproval,
  AgentWorkCommand,
  AgentWorkConnection,
  AgentWorkEvent,
  AgentWorkManager,
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

// Native Agent accepts one connection. A replacement, even across a view
// remount, must wait for the previous startup and teardown to finish.
const pendingCloses = new WeakMap<AgentWorkManager, Promise<void>>();

export function useAgentWork(scope?: AgentWorkScope) {
  const { agentWork } = usePlatform();
  const connection = useRef<AgentWorkConnection | null>(null);
  const [state, setState] = useState(initialAgentWorkState);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [error, setError] = useState<string>();
  const [approvals, setApprovals] = useState<AgentWorkApproval[]>([]);
  const [auth, setAuth] = useState<Extract<AgentWorkEvent, { type: "auth" }>>();
  const [revision, setRevision] = useState(0);
  const { apiUrl, organizationId, userId } = scope ?? {};

  useEffect(() => {
    setRuntimeReady(false);
    setState(initialAgentWorkState);
    setApprovals([]);
    setAuth(undefined);
    setError(undefined);
    if (!(agentWork && apiUrl && organizationId && userId)) {
      return;
    }
    let active = true;
    let disconnected = false;
    const previousClose = pendingCloses.get(agentWork) ?? Promise.resolve();
    const start = previousClose.then(() =>
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
                  pending.filter((item) => item.id !== event.id)
                );
                break;
              case "auth":
                setAuth((current) =>
                  event.url || event.prompt || event.message
                    ? { ...current, ...event }
                    : undefined
                );
                break;
              case "error":
                setError(event.message);
                break;
            }
          })
        : undefined
    );
    void start
      .then(async (value) => {
        if (!(value && active)) {
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
      const close = start
        .then((value) => value?.close())
        .catch(() => undefined);
      pendingCloses.set(agentWork, close);
      void close.then(() => {
        if (pendingCloses.get(agentWork) === close) {
          pendingCloses.delete(agentWork);
        }
      });
    };
  }, [agentWork, apiUrl, organizationId, userId, revision]);

  const request = useCallback(async (command: AgentWorkCommand) => {
    setError(undefined);
    const current = connection.current;
    try {
      if (!current) {
        throw new Error("Agent is not connected");
      }
      await current.request(command);
      return true;
    } catch (cause) {
      if (connection.current === current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
      return false;
    }
  }, []);
  const resolveTool = async (id: string, approved: boolean) => {
    const current = connection.current;
    try {
      await current?.resolveTool(id, approved);
    } catch (cause) {
      if (connection.current === current) {
        setError(String(cause));
      }
    }
  };
  const reconnect = () => {
    setRevision((value) => value + 1);
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
