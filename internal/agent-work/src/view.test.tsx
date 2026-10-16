// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AgentWorkEvent, AgentWorkState } from "@repo/platform";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../features/src/locale/locales/en.json";
const runtime = vi.hoisted(() => ({
  searchMentions: vi.fn(),
  connect: vi.fn(),
  request: vi.fn(),
  close: vi.fn(),
  resolveTool: vi.fn(),
  listener: null as null | ((event: AgentWorkEvent) => void),
}));
vi.mock("./use-resource-mentions", () => ({
  useResourceMentionSearch: () => runtime.searchMentions,
}));
vi.mock("@repo/features/auth", () => ({ useAuth: vi.fn() }));
vi.mock("@repo/features/api", () => ({ useApi: vi.fn() }));
vi.mock("@repo/platform", () => ({
  usePlatform: () => ({ agentWork: runtime }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)?.[part],
          en
        ) ?? key,
  }),
}));
vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => <div>{children}</div>,
}));
import { AgentWorkView } from "./view";
const scope = {
  apiUrl: "http://localhost",
  userId: "user",
  organizationId: "org",
};
const state: AgentWorkState = {
  authenticated: true,
  busy: false,
  models: [{ id: "gpt-5.5", name: "GPT-5.5" }],
  modelId: "gpt-5.5",
  sessionId: null,
  sessions: [],
  messages: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  runtime.searchMentions.mockResolvedValue([
    {
      name: "Launch plan",
      kind: "resource",
      resourceTypeId: "lunaris.rich-text",
      reference: {
        type: "workspace-resource",
        workspaceId: "workspace",
        resourceId: "resource",
      },
      workspaceName: "Product",
      storage: {},
    },
  ]);
  localStorage.clear();
  runtime.connect.mockImplementation(async (_scope, listener) => {
    runtime.listener = listener;
    return runtime;
  });
  runtime.close.mockResolvedValue(undefined);
  runtime.request.mockImplementation(async () => {
    runtime.listener?.({ type: "state", state });
  });
});
afterEach(cleanup);
const mount = (embedded = false) =>
  render(
    <StrictMode>
      <AgentWorkView
        {...(embedded
          ? { variant: "panel" as const }
          : {
              variant: "workbench" as const,
              AppBarLeading: () => null,
              AppBarTrailing: () => null,
            })}
        scope={scope}
      />
    </StrictMode>
  );

describe("Agent Work", () => {
  it("clears approvals and sign-in UI after disconnection, then reconnects", async () => {
    mount(true);
    const composer = () =>
      screen.getByRole("textbox", {
        name: "Message the agent",
      }) as HTMLTextAreaElement;
    await waitFor(() => expect(composer().disabled).toBe(false));
    act(() => {
      runtime.listener?.({ type: "state", state: { ...state, busy: true } });
      runtime.listener?.({
        type: "approval",
        approval: { id: "pending", name: "create_resource", input: {} },
      });
      runtime.listener?.({
        type: "auth",
        url: "https://auth.openai.com/authorize",
      });
    });
    expect(screen.getByRole("button", { name: "Approve change" })).toBeTruthy();
    act(() =>
      runtime.listener?.({
        type: "disconnected",
        message: "Agent Work disconnected",
      })
    );
    expect(composer().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Approve change" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: en.agentWork.stop })
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: en.agentWork.openLogin })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: en.agentWork.reconnect })
    );
    await waitFor(() => expect(composer().disabled).toBe(false));
    expect(runtime.connect).toHaveBeenCalledTimes(2);
  });
  it("does not enable chat if the process exits during initial status", async () => {
    runtime.request.mockImplementation(async () => {
      runtime.listener?.({ type: "state", state });
      runtime.listener?.({
        type: "disconnected",
        message: "Agent Work disconnected",
      });
    });
    mount(true);
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({ type: "status" })
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message the agent",
        }) as HTMLTextAreaElement
      ).disabled
    ).toBe(true);
  });
  it("shares runtime, draft, session commands, and approvals in the embedded panel", async () => {
    mount(true);
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({ type: "status" })
    );
    expect(screen.queryByRole("tab")).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { target: { value: "Keep my draft" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    expect(
      screen.getByRole("textbox", { name: "Message the agent" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message the agent",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("Keep my draft");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({
        type: "prompt",
        text: "Keep my draft",
        modelId: "gpt-5.5",
      })
    );
    act(() =>
      runtime.listener?.({
        type: "approval",
        approval: {
          id: "embedded-call",
          name: "create_resource",
          input: { title: "Notes" },
        },
      })
    );
    expect(screen.queryByRole("button", { name: /^Activity/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve change" }));
    expect(runtime.resolveTool).toHaveBeenCalledWith("embedded-call", true);
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(runtime.request).toHaveBeenCalledWith({ type: "new_session" });
    expect(
      screen.getByRole("textbox", { name: "Message the agent" })
    ).toBeTruthy();
    expect(runtime.connect).toHaveBeenCalledTimes(1);
  });

  it("connects once in StrictMode and sends a typed prompt", async () => {
    mount();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Message the agent",
          }) as HTMLTextAreaElement
        ).disabled
      ).toBe(false)
    );
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { target: { value: "Summarize my resources" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({
        type: "prompt",
        text: "Summarize my resources",
        modelId: "gpt-5.5",
      })
    );
  });
  it("shows resource changes and sends the explicit approval choice", async () => {
    mount();
    await waitFor(() => expect(runtime.listener).not.toBeNull());
    act(() =>
      runtime.listener?.({
        type: "approval",
        approval: {
          id: "call",
          name: "rich_text_update_document",
          input: { resourceId: "resource-1", markdown: "New content" },
        },
      })
    );
    expect(screen.getByText(/New content/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(runtime.resolveTool).toHaveBeenCalledWith("call", false);
  });
  it("preserves the sign-in link when the manual redirect prompt arrives", async () => {
    mount();
    await waitFor(() => expect(runtime.connect).toHaveBeenCalledTimes(1));
    act(() => {
      runtime.listener?.({
        type: "auth",
        url: "https://auth.openai.com/authorize",
      });
      runtime.listener?.({ type: "auth", prompt: "Paste redirect" });
    });
    expect(
      screen
        .getByRole("link", { name: en.agentWork.openLogin })
        .getAttribute("href")
    ).toBe("https://auth.openai.com/authorize");
    expect(screen.getByLabelText(en.agentWork.pasteRedirect)).toBeTruthy();
    act(() => runtime.listener?.({ type: "auth" }));
    expect(
      screen.queryByRole("link", { name: en.agentWork.openLogin })
    ).toBeNull();
  });
  it("keeps unsent text available after a failed request", async () => {
    mount();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Message the agent",
          }) as HTMLTextAreaElement
        ).disabled
      ).toBe(false)
    );
    runtime.request.mockRejectedValueOnce(new Error("Provider unavailable"));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { target: { value: "Keep this draft" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(
        screen.getByRole("alert", { name: "Agent error" }).textContent
      ).toContain("Provider unavailable")
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message the agent",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("Keep this draft");
  });
  it("keeps fixed panels without close, add, or context-menu actions", async () => {
    mount();
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({ type: "status" })
    );
    for (const name of ["Conversations", "Chat", "Activity"]) {
      const tab = screen.getByRole("tab", { name });
      fireEvent.contextMenu(tab);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(
        screen.queryByRole("button", { name: `Close: ${name}` })
      ).toBeNull();
      fireEvent.mouseDown(tab, { button: 1 });
      fireEvent.mouseUp(tab, { button: 1 });
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Panels" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
  it.each([
    "malformed",
    '{"chat":null,"activity":-1}',
    '{"grid":{},"panels":{}}',
  ])("restores all panels when saved widths are invalid: %s", async (saved) => {
    localStorage.setItem(
      `lunaris.agent-panel-widths.v1:${JSON.stringify([scope.apiUrl, scope.userId, scope.organizationId, false])}`,
      saved
    );
    mount();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    expect(screen.getByRole("tab", { name: "Activity" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Conversations" })).toBeTruthy();
  });
  it("keeps approvals reachable in the fixed layout", async () => {
    mount();
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({ type: "status" })
    );
    act(() =>
      runtime.listener?.({
        type: "approval",
        approval: {
          id: "pending",
          name: "create_resource",
          input: { title: "Review me" },
        },
      })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "agentWork.pendingApprovals" })
    );
    expect(screen.getByText(/Review me/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve change" }));
    expect(runtime.resolveTool).toHaveBeenCalledWith("pending", true);
  });
});

it.each([true, false])(
  "sends exact resource mentions in panel=%s",
  async (panel) => {
    mount(panel);
    const composer = screen.getByRole("textbox", { name: "Message the agent" });
    await waitFor(() =>
      expect((composer as HTMLTextAreaElement).disabled).toBe(false)
    );
    fireEvent.change(composer, {
      target: { value: "Review @lau", selectionStart: 11 },
    });
    await screen.findByRole("option", { name: "Launch plan Product" });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect((composer as HTMLTextAreaElement).value).toBe(
      "Review @Launch plan "
    );
    expect(
      runtime.request.mock.calls.some(([command]) => command.type === "prompt")
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(runtime.request).toHaveBeenCalledWith({
        type: "prompt",
        text: expect.stringContaining('"resourceId":"resource"'),
        modelId: "gpt-5.5",
      })
    );
  }
);

it("restores mentions after failed send and clears them with a new conversation", async () => {
  mount(true);
  const composer = screen.getByRole("textbox", { name: "Message the agent" });
  await waitFor(() =>
    expect((composer as HTMLTextAreaElement).disabled).toBe(false)
  );
  fireEvent.change(composer, { target: { value: "@lau", selectionStart: 4 } });
  fireEvent.click(
    await screen.findByRole("option", { name: "Launch plan Product" })
  );
  runtime.request.mockRejectedValueOnce(new Error("Send failed"));
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message the agent",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("@Launch plan ")
  );
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(
      runtime.request.mock.calls.filter(
        ([command]) => command.type === "prompt"
      )
    ).toHaveLength(2)
  );
  const prompts = runtime.request.mock.calls.filter(
    ([command]) => command.type === "prompt"
  );
  expect(prompts[0][0].text).toBe(prompts[1][0].text);
  fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message the agent" }), {
    target: { value: "Review @Launch plan" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(runtime.request).toHaveBeenCalledWith({
      type: "prompt",
      text: "Review @Launch plan",
      modelId: "gpt-5.5",
    })
  );
});

it("supports navigation, Tab selection, and Escape without sending", async () => {
  runtime.searchMentions.mockResolvedValue([
    {
      name: "One",
      kind: "resource",
      resourceTypeId: "lunaris.rich-text",
      reference: {
        type: "workspace-resource",
        workspaceId: "workspace",
        resourceId: "one",
      },
      workspaceName: "Product",
      storage: {},
    },
    {
      name: "Two",
      kind: "resource",
      resourceTypeId: "lunaris.rich-text",
      reference: {
        type: "workspace-resource",
        workspaceId: "workspace",
        resourceId: "two",
      },
      workspaceName: "Product",
      storage: {},
    },
  ]);
  mount(true);
  const composer = screen.getByRole("textbox", { name: "Message the agent" });
  await waitFor(() =>
    expect((composer as HTMLTextAreaElement).disabled).toBe(false)
  );
  fireEvent.change(composer, { target: { value: "@", selectionStart: 1 } });
  await screen.findByRole("option", { name: "One Product" });
  fireEvent.keyDown(composer, { key: "ArrowUp" });
  expect(
    screen
      .getByRole("option", { name: "Two Product" })
      .getAttribute("aria-selected")
  ).toBe("true");
  fireEvent.keyDown(composer, { key: "Tab" });
  expect((composer as HTMLTextAreaElement).value).toBe("@Two ");
  fireEvent.change(composer, {
    target: { value: "@Two @", selectionStart: 6 },
  });
  await screen.findByRole("option", { name: "One Product" });
  fireEvent.keyDown(composer, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(
    runtime.request.mock.calls.some(([command]) => command.type === "prompt")
  ).toBe(false);
});

it("ignores outdated search results and reports search failures", async () => {
  let finishOld: (items: unknown[]) => void = () => {};
  runtime.searchMentions.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      })
  );
  mount(true);
  const composer = screen.getByRole("textbox", { name: "Message the agent" });
  await waitFor(() =>
    expect((composer as HTMLTextAreaElement).disabled).toBe(false)
  );
  fireEvent.change(composer, { target: { value: "@old", selectionStart: 4 } });
  await waitFor(() =>
    expect(runtime.searchMentions).toHaveBeenCalledWith(
      "old",
      expect.any(AbortSignal)
    )
  );
  runtime.searchMentions.mockRejectedValueOnce(new Error("Search failed"));
  fireEvent.change(composer, { target: { value: "@new", selectionStart: 4 } });
  await screen.findByText("Could not search resources");
  await act(async () =>
    finishOld([
      {
        name: "Stale",
        reference: {
          type: "workspace-resource",
          workspaceId: "w",
          resourceId: "r",
        },
        workspaceName: "Old",
      },
    ])
  );
  expect(screen.queryByRole("option", { name: "Stale Old" })).toBeNull();
  fireEvent.keyDown(composer, { key: "Enter" });
  expect(
    runtime.request.mock.calls.some(([command]) => command.type === "prompt")
  ).toBe(false);
});

it("does not revive a deleted mention when selecting another resource with the same name", async () => {
  const option = (resourceId: string, workspaceName: string) => ({
    name: "Notes",
    kind: "resource",
    resourceTypeId: "lunaris.rich-text",
    reference: {
      type: "workspace-resource",
      workspaceId: workspaceName,
      resourceId,
    },
    workspaceName,
    storage: {},
  });
  runtime.searchMentions
    .mockResolvedValueOnce([option("old", "Old")])
    .mockResolvedValueOnce([option("new", "New")]);
  mount(true);
  const composer = () =>
    screen.getByRole("textbox", { name: "Message the agent" });
  await waitFor(() =>
    expect((composer() as HTMLTextAreaElement).disabled).toBe(false)
  );
  fireEvent.change(composer(), { target: { value: "@n", selectionStart: 2 } });
  fireEvent.click(await screen.findByRole("option", { name: "Notes Old" }));
  fireEvent.change(composer(), { target: { value: "", selectionStart: 0 } });
  fireEvent.change(composer(), { target: { value: "@n", selectionStart: 2 } });
  fireEvent.click(await screen.findByRole("option", { name: "Notes New" }));
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(
      runtime.request.mock.calls.some(([command]) => command.type === "prompt")
    ).toBe(true)
  );
  const prompt = runtime.request.mock.calls.find(
    ([command]) => command.type === "prompt"
  )![0];
  expect(prompt.text).toContain('"resourceId":"new"');
  expect(prompt.text).not.toContain('"resourceId":"old"');
});

it("does not merge failed-send references into a newly typed draft", async () => {
  mount(true);
  const composer = () =>
    screen.getByRole("textbox", { name: "Message the agent" });
  await waitFor(() =>
    expect((composer() as HTMLTextAreaElement).disabled).toBe(false)
  );
  fireEvent.change(composer(), {
    target: { value: "@lau", selectionStart: 4 },
  });
  fireEvent.click(
    await screen.findByRole("option", { name: "Launch plan Product" })
  );
  let fail: (error: Error) => void = () => {};
  runtime.request.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      })
  );
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  fireEvent.change(composer(), { target: { value: "New draft @Launch plan" } });
  await act(async () => fail(new Error("Send failed")));
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(runtime.request).toHaveBeenCalledWith({
      type: "prompt",
      text: "New draft @Launch plan",
      modelId: "gpt-5.5",
    })
  );
});
