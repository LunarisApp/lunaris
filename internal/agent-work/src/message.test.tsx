import { buildMentionMessage } from "./mentions";
// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolCall, TranscriptMessage } from "./message";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const writeText = vi.hoisted(() => vi.fn());
vi.mock("@repo/platform", () => ({
  usePlatform: () => ({ clipboard: { writeText } }),
}));
afterEach(() => {
  cleanup();
  writeText.mockReset();
});

describe("chat messages", () => {
  it.each(["user", "assistant"] as const)("copies %s messages as original Markdown", async (role) => {
    writeText.mockResolvedValue(undefined);
    const timestamp = Date.UTC(2026, 9, 9, 12, 30);
    const { container } = render(<TranscriptMessage message={{
      id: role, role, text: "**Keep** markdown", timestamp,
    }} />);
    expect(container.querySelector("time")?.dateTime).toBe(new Date(timestamp).toISOString());
    fireEvent.click(screen.getByRole("button", { name: "agentWork.copyMessage" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "agentWork.copied" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("**Keep** markdown");
  });
  it("reports clipboard failure and allows retry without inventing a timestamp", async () => {
    writeText.mockRejectedValueOnce(new Error("Denied")).mockResolvedValueOnce(undefined);
    const { container } = render(<TranscriptMessage message={{ id: "reply", role: "assistant", text: "Hello" }} />);
    expect(container.querySelector("time")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "agentWork.copyMessage" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("agentWork.copyFailed"));
    fireEvent.click(screen.getByRole("button", { name: "agentWork.copyFailed" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("agentWork.copied"));
  });
  it("renders real Markdown without visible role labels", async () => {
    const { container } = render(
      <TranscriptMessage
        message={{
          id: "reply",
          role: "assistant",
          text: "### Notes\n\n**Ready** with `code`.\n\n- First\n- Second\n\n| Name | Status |\n| --- | --- |\n| Notes | Done |\n\n```ts\nconst count = 2;\n```",
        }}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Notes" })).toBeTruthy()
    );
    expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe("Ready");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(container.querySelector("pre")?.textContent).toContain(
      "const count = 2;"
    );
    expect(screen.queryByText("agentWork.assistant")).toBeNull();
  });
  it("renders user Markdown and strips unsafe HTML", async () => {
    const { container } = render(
      <TranscriptMessage
        message={{
          id: "user",
          role: "user",
          text: "**Review this**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))",
        }}
      />
    );
    await waitFor(() =>
      expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe("Review this")
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
  it("shows tool status, expands arguments and results, and exposes approval navigation", () => {
    const onReview = vi.fn();
    const { container, rerender } = render(
      <ToolCall
        awaitingApproval
        onReview={onReview}
        message={{
          id: "call",
          role: "tool",
          toolCallId: "call",
          toolName: "create_resource",
          toolInput: { title: "Notes" },
          toolStatus: "running",
          text: "",
        }}
      />
    );
    expect(screen.getByText("agentWork.awaitingApproval")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "agentWork.reviewChange" })
    );
    expect(onReview).toHaveBeenCalledOnce();
    rerender(
      <ToolCall
        message={{
          id: "call",
          role: "tool",
          toolCallId: "call",
          toolName: "create_resource",
          toolInput: { title: "Notes" },
          toolStatus: "failed",
          text: '{"error":"Denied"}',
        }}
      />
    );
    expect(screen.getByText("agentWork.failed")).toBeTruthy();
    expect(container.querySelectorAll("pre")[1].textContent).toContain(
      '"error": "Denied"'
    );
  });
});

it("hides resource context when rendering and copying user messages", async () => {
  const text = buildMentionMessage("Review @Notes", [{ start: 7, end: 13, name: "Notes", kind: "resource", resourceTypeId: "lunaris.rich-text", reference: { type: "workspace-resource", workspaceId: "workspace", resourceId: "resource" }, workspaceName: "Product", storage: {} }]);
  const { container } = render(<TranscriptMessage message={{ id: "user", role: "user", text }} />);
  await waitFor(() => expect(container.textContent).toContain("Review @Notes"));
  expect(container.textContent).not.toContain("resourceId");
  fireEvent.click(screen.getByRole("button", { name: "agentWork.copyMessage" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("Review @Notes"));
});
