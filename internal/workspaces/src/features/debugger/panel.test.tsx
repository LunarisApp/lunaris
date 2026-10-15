/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebuggerPanelContent } from "./panel";

const translations: Record<string, string> = {
  "debugger.tabs.workspaceResources": "Workspace Items",
  "debugger.tabs.yjsDocuments": "Yjs Documents",
  "debugger.tabs.uploadQueue": "Upload Queue",
  "debugger.tabs.attachments": "Attachments",
  "debugger.empty.workspaceResources": "No workspace resources rows",
  "debugger.empty.yjsDocuments": "No Yjs document rows",
  "debugger.empty.uploadQueue": "No pending uploads",
  "debugger.empty.attachments": "No attachment rows",
  "debugger.json.view": "View JSON",
  "debugger.json.title": "Compiled JSON",
  "debugger.json.loading": "Compiling JSON...",
  "debugger.json.error": "Failed to compile JSON",
  "debugger.json.noUpdates": "No updates found for this document.",
  "debugger.uploadQueue.viewBody": "View Body",
  "debugger.uploadQueue.title": "Upload Entry",
};
const t = (key: string) => translations[key] ?? key;
const mockDb = {
  getAll: vi.fn(),
  getOptional: vi.fn(),
};

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
  }),
}));

vi.mock("@lunarisapp/ui/components/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t,
  }),
}));

vi.mock("@repo/features/locale", () => ({
  useLocale: () => ({
    locale: "en-US",
  }),
}));

vi.mock("@repo/utils", () => ({
  formatAbsoluteTime: (date: Date) => `ABS:${date.toISOString()}`,
  parseUTCTimestamp: (value: string) => new Date(value),
}));

vi.mock("@repo/data/core", () => ({
  usePowerSync: vi.fn(() => mockDb),
  useQuery: vi.fn(() => ({ data: [], isLoading: false, error: undefined })),
}));

vi.mock("@repo/data/features/workspace-resources", () => ({
  useWorkspaceResourcesQuery: vi.fn(),
}));

vi.mock("@repo/data/features/yjs", () => ({
  compileYjsDocumentJson: vi.fn(),
  useYjsDocumentsQuery: vi.fn(),
}));

vi.mock("@uiw/react-json-view", () => ({
  default: ({ value }: { value: unknown }) => (
    <div data-testid="compiled-json-view">{JSON.stringify(value)}</div>
  ),
}));

const { useWorkspaceResourcesQuery } = await import("@repo/data/features/workspace-resources");
const { useQuery } = await import("@repo/data/core");
const {
  compileYjsDocumentJson,
  useYjsDocumentsQuery,
} = await import("@repo/data/features/yjs");
const mockWorkspaceResourcesQuery = useWorkspaceResourcesQuery as ReturnType<typeof vi.fn>;
const mockYjsDocumentsQuery = useYjsDocumentsQuery as ReturnType<typeof vi.fn>;
const mockUseQuery = useQuery as ReturnType<typeof vi.fn>;
const mockCompileYjsDocumentJson = compileYjsDocumentJson as ReturnType<
  typeof vi.fn
>;

describe("DebuggerPanelContent", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
    });
  });

  it("switches tabs and renders correct rows", async () => {
    const user = userEvent.setup();
    mockWorkspaceResourcesQuery.mockReturnValue({
      data: [
        {
          id: "item_1",
          name: "Chapter 1",
          plugin_id: "lunaris.rich-text",
          parent_id: null,
          position: 0,
          updated_at: "2026-04-06T00:00:00Z",
        },
      ],
    } as never);
    mockYjsDocumentsQuery.mockReturnValue({
      data: [
        {
          id: "yjs_1",
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-06T00:00:00Z",
          update_count: 2,
        },
      ],
    } as never);

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    expect(screen.getByText("Chapter 1")).toBeTruthy();
    expect(screen.getByText("ABS:2026-04-06T00:00:00.000Z")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Yjs Documents" }));
    expect(screen.getByText("yjs_1")).toBeTruthy();
    expect(screen.getByText("ABS:2026-04-05T00:00:00.000Z")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows explicit empty states", async () => {
    const user = userEvent.setup();
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({ data: [] } as never);

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    expect(screen.getByText("No workspace resources rows")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Yjs Documents" }));
    expect(screen.getByText("No Yjs document rows")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Attachments" }));
    expect(screen.getByText("No attachment rows")).toBeTruthy();
  });

  it("renders attachment rows", async () => {
    const user = userEvent.setup();
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({ data: [] } as never);
    mockUseQuery.mockImplementation((query: string) => ({
      data: query.includes("FROM attachments")
        ? [
            {
              id: "att_1",
              filename: "att_1.png",
              local_uri: "local://att_1",
              media_type: "image/png",
              size: 123,
              state: 3,
              has_synced: 1,
              timestamp: 1_777_333,
              value: "{\"filename\":\"cover.png\"}",
            },
          ]
        : [],
      error: undefined,
      isLoading: false,
    }));

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    await user.click(screen.getByRole("tab", { name: "Attachments" }));

    expect(screen.getByText("att_1")).toBeTruthy();
    expect(screen.getByText("att_1.png")).toBeTruthy();
    expect(screen.getByText("SYNCED (3)")).toBeTruthy();
    expect(screen.getByText("local://att_1")).toBeTruthy();
    expect(screen.getByText("image/png")).toBeTruthy();
    expect(screen.getByText("{\"filename\":\"cover.png\"}")).toBeTruthy();
  });

  it("queries attachment metadata with the real PowerSync column name", () => {
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({ data: [] } as never);

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.stringContaining("meta_data AS value"),
      []
    );
  });

  it("re-queries when workspaceId changes", () => {
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({ data: [] } as never);

    const { rerender } = render(<DebuggerPanelContent workspaceId="workspace_1" />);
    rerender(<DebuggerPanelContent workspaceId="workspace_2" />);

    expect(useWorkspaceResourcesQuery).toHaveBeenLastCalledWith("workspace_2");
    expect(useYjsDocumentsQuery).toHaveBeenLastCalledWith("workspace_2");
  });

  it("does not compile json before the row action is clicked", () => {
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({
      data: [
        {
          id: "yjs_1",
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-06T00:00:00Z",
          update_count: 0,
        },
      ],
    } as never);
    mockCompileYjsDocumentJson.mockResolvedValue({});

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    expect(mockCompileYjsDocumentJson).not.toHaveBeenCalled();
  });

  it("opens the dialog and renders compiled json after clicking the row action", async () => {
    const user = userEvent.setup();
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({
      data: [
        {
          id: "yjs_1",
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-06T00:00:00Z",
          update_count: 1,
        },
      ],
    } as never);
    mockCompileYjsDocumentJson.mockResolvedValue({
      meta: { title: "Test" },
    });

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    await user.click(screen.getByRole("tab", { name: "Yjs Documents" }));
    await user.click(screen.getByRole("button", { name: "View JSON" }));

    expect(await screen.findByText("Compiled JSON")).toBeTruthy();
    expect(
      (await screen.findByTestId("compiled-json-view")).textContent
    ).toContain(JSON.stringify({ meta: { title: "Test" } }));
  });

  it("shows an empty-json note when the document has no updates", async () => {
    const user = userEvent.setup();
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({
      data: [
        {
          id: "yjs_1",
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-06T00:00:00Z",
          update_count: 0,
        },
      ],
    } as never);
    mockCompileYjsDocumentJson.mockResolvedValue({});

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    await user.click(screen.getByRole("tab", { name: "Yjs Documents" }));
    await user.click(screen.getByRole("button", { name: "View JSON" }));

    expect(
      await screen.findByText("No updates found for this document.")
    ).toBeTruthy();
    expect((await screen.findByTestId("compiled-json-view")).textContent).toBe(
      "{}"
    );
  });

  it("shows an explicit error state when compilation fails", async () => {
    const user = userEvent.setup();
    mockWorkspaceResourcesQuery.mockReturnValue({ data: [] } as never);
    mockYjsDocumentsQuery.mockReturnValue({
      data: [
        {
          id: "yjs_1",
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-06T00:00:00Z",
          update_count: 1,
        },
      ],
    } as never);
    mockCompileYjsDocumentJson.mockRejectedValue(new Error("bad update"));

    render(<DebuggerPanelContent workspaceId="workspace_1" />);

    await user.click(screen.getByRole("tab", { name: "Yjs Documents" }));
    await user.click(screen.getByRole("button", { name: "View JSON" }));

    expect(await screen.findByText("bad update")).toBeTruthy();
  });
});
