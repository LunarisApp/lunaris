import type {
  AgentWorkManager,
  AgentWorkMessage,
  AgentWorkState,
} from "@repo/platform";

// Keep preview conversations in memory for the lifetime of this view.
export const previewAgentWork: AgentWorkManager = {
  preview: true,
  async connect(_scope, listener) {
    const transcripts = new Map<string, AgentWorkMessage[]>();
    let state: AgentWorkState = {
      authenticated: true,
      busy: false,
      messages: [],
      modelId: "preview",
      models: [{ id: "preview", name: "Browser preview" }],
      sessionId: null,
      sessions: [],
    };
    return {
      close: async () => undefined,
      resolveTool: async () => undefined,
      async request(command) {
        switch (command.type) {
          case "prompt": {
            if (!state.authenticated) {
              return;
            }
            const id = state.sessionId ?? crypto.randomUUID();
            const messages: AgentWorkMessage[] = [
              ...state.messages,
              { role: "user", id: crypto.randomUUID(), text: command.text },
              {
                role: "assistant",
                id: crypto.randomUUID(),
                text: "This is a simulated reply for the local browser preview.",
              },
            ];
            transcripts.set(id, messages);
            const title =
              state.sessions.find((item) => item.id === id)?.title ??
              command.text.slice(0, 64);
            state = {
              ...state,
              messages,
              sessionId: id,
              sessions: [
                { id, title, updatedAt: new Date().toISOString() },
                ...state.sessions.filter((item) => item.id !== id),
              ],
            };
            break;
          }
          case "open_session": {
            const messages = transcripts.get(command.sessionId);
            if (messages) {
              state = { ...state, sessionId: command.sessionId, messages };
            }
            break;
          }
          case "new_session":
            state = { ...state, sessionId: null, messages: [] };
            break;
          case "login":
          case "logout":
            state = { ...state, authenticated: command.type === "login" };
            break;
          default:
            break;
        }
        listener({ type: "state", state });
      },
    };
  },
};
