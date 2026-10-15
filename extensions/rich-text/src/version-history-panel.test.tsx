import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichTextVersionHistoryPanel } from "./version-history-panel";

let currentLastEditedAt: Date | null = null;
let currentLastEditedLoading = false;
const mockGetYjsDocumentUpdateRows = vi.fn();
const mockBuildRichTextVersionHistory = vi.fn();
vi.mock("@lunarisapp/plugin-sdk", () => ({
  useApiTransport: () => ({ baseUrl: "https://api.example.com" }),
  useCurrentUser: () => ({
    isLoading: false,
    user: {
      email: "current@example.com",
      id: "user_1",
      image: "https://storage.example.com/current-avatar.png",
      name: "Current User",
    },
  }),
  useYjsStorageLastEdited: () => ({
    isLoading: currentLastEditedLoading,
    lastEditedAt: currentLastEditedAt,
  }),
  useLocale: () => ({ locale: "en-US" }),
  useOrgMembersMap: () => ({
    isLoading: false,
    map: new Map([
      [
        "user_2",
        {
          email: "alice@example.com",
          id: "user_2",
          name: "Alice",
        },
      ],
    ]),
  }),
  useYjsStorageUpdateRows: () => mockGetYjsDocumentUpdateRows,
}));

const storage = { kind: "yjs" as const, storageId: "doc_1" };

vi.mock("@lunarisapp/ui/components/avatar", () => ({
  Avatar: ({
    children,
    "data-testid": testId,
  }: {
    children: ReactNode;
    "data-testid"?: string;
  }) => <span data-testid={testId}>{children}</span>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <>{children}</>,
  AvatarImage: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock("@lunarisapp/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@lunarisapp/ui/components/empty", () => ({
  Empty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyMedia: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@lunarisapp/ui/components/panel-error", () => ({
  PanelError: ({
    description,
    title,
  }: {
    description?: string;
    title: string;
  }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

vi.mock("@lunarisapp/ui/components/skeleton", () => ({
  Skeleton: () => <div data-testid="history-skeleton">loading</div>,
}));

vi.mock("@lunarisapp/ui/hooks/use-gravatar-url", () => ({
  useGravatarUrl: (email?: string | null) =>
    email ? `https://gravatar.test/${encodeURIComponent(email)}` : undefined,
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  ArrowDown01Icon: {},
  Cancel01Icon: {},
  HugeiconsIcon: () => <div>icon</div>,
  Time01Icon: {},
}));

vi.mock("@lunarisapp/plugin-sdk/time", () => ({
  formatAbsoluteTime: (value: Date) => value.toISOString(),
  formatRelativeTime: () => "moments ago",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; id?: string }) => {
      if (key === "extensions.catalog.lunaris.rich-text.history.collaborator") {
        return `Collaborator ${options?.id}`;
      }
      if (key === "extensions.catalog.lunaris.rich-text.history.you") {
        return "You";
      }
      if (key === "extensions.catalog.lunaris.rich-text.history.system") {
        return "System";
      }
      if (key === "extensions.catalog.lunaris.rich-text.history.moreLines") {
        return `${options?.count ?? 0} more`;
      }
      return key;
    },
  }),
}));

vi.mock("./version-history", () => ({
  buildRichTextVersionHistory: (...args: unknown[]) =>
    mockBuildRichTextVersionHistory(...args),
}));

describe("RichTextVersionHistoryPanel", () => {
  beforeEach(() => {
    currentLastEditedAt = null;
    currentLastEditedLoading = false;
    mockGetYjsDocumentUpdateRows.mockReset();
    mockBuildRichTextVersionHistory.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes an accessible sidebar and close control", async () => {
    mockGetYjsDocumentUpdateRows.mockResolvedValue([]);
    mockBuildRichTextVersionHistory.mockReturnValue([]);
    const onClose = vi.fn();

    render(
      <RichTextVersionHistoryPanel
        storage={storage}
        resourceId="item_1"
        onClose={onClose}
      />
    );

    const sidebar = screen.getByRole("complementary", {
      name: "common.versionHistory",
    });
    expect(sidebar.classList.contains("rounded-xl")).toBe(true);
    expect(sidebar.classList.contains("border")).toBe(true);
    expect(sidebar.classList.contains("inset-y-3")).toBe(true);
    expect(screen.queryByText("Doc One")).toBeNull();
    await screen.findByText(
      "extensions.catalog.lunaris.rich-text.history.emptyTitle"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.history.close",
      })
    );

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("loads initial snapshot once and does not subscribe to live update rows", async () => {
    const rows = [makeRow("u1", "2026-04-19T10:00:00.000Z")];
    mockGetYjsDocumentUpdateRows.mockResolvedValue(rows);
    mockBuildRichTextVersionHistory.mockReturnValue([makeEntry("u1", "First change")]);

    const view = render(
      <RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />
    );

    expect(screen.getAllByTestId("history-skeleton").length).toBeGreaterThan(0);

    await waitFor(() =>
      expect(mockGetYjsDocumentUpdateRows).toHaveBeenCalledWith(storage)
    );
    await waitFor(() => expect(screen.getByText(/First change/)).toBeTruthy());

    currentLastEditedAt = new Date("2026-04-19T10:00:00.000Z");
    view.rerender(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() => expect(screen.getByText(/First change/)).toBeTruthy());
    expect(mockGetYjsDocumentUpdateRows).toHaveBeenCalledTimes(1);
  });

  it("keeps current entries visible during refresh and swaps new history in after load", async () => {
    const firstRows = [makeRow("u1", "2026-04-19T10:00:00.000Z")];
    const secondRows = [makeRow("u2", "2026-04-19T10:05:00.000Z")];
    const secondRequest = createDeferred<ReturnType<typeof makeRow>[]>();

    mockGetYjsDocumentUpdateRows
      .mockResolvedValueOnce(firstRows)
      .mockImplementationOnce(() => secondRequest.promise);
    mockBuildRichTextVersionHistory
      .mockReturnValueOnce([makeEntry("u1", "First change")])
      .mockReturnValueOnce([makeEntry("u2", "Second change")]);

    const view = render(
      <RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />
    );

    await waitFor(() => expect(screen.getByText(/First change/)).toBeTruthy());

    currentLastEditedAt = new Date("2026-04-19T10:05:00.000Z");
    view.rerender(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() => expect(mockGetYjsDocumentUpdateRows).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/First change/)).toBeTruthy();
    expect(screen.queryByTestId("history-skeleton")).toBeNull();

    secondRequest.resolve(secondRows);

    await waitFor(() => expect(screen.getByText(/Second change/)).toBeTruthy());
    expect(screen.queryByText(/First change/)).toBeNull();
  });

  it("resets state and loads new document snapshot when document changes", async () => {
    const secondRequest = createDeferred<ReturnType<typeof makeRow>[]>();

    mockGetYjsDocumentUpdateRows
      .mockResolvedValueOnce([makeRow("u1", "2026-04-19T10:00:00.000Z")])
      .mockImplementationOnce(() => secondRequest.promise);
    mockBuildRichTextVersionHistory
      .mockReturnValueOnce([makeEntry("u1", "Doc one change")])
      .mockReturnValueOnce([makeEntry("u2", "Doc two change")]);

    const view = render(
      <RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />
    );

    await waitFor(() => expect(screen.getByText(/Doc one change/)).toBeTruthy());

    view.rerender(
      <RichTextVersionHistoryPanel
        storage={{ kind: "yjs", storageId: "doc_2" }}
        resourceId="item_2"
      />
    );

    await waitFor(() =>
      expect(screen.getAllByTestId("history-skeleton").length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/Doc one change/)).toBeNull();

    secondRequest.resolve([makeRow("u2", "2026-04-19T10:10:00.000Z")]);

    await waitFor(() => expect(screen.getByText(/Doc two change/)).toBeTruthy());
  });

  it("renders avatar and label for the current user's own session", async () => {
    mockGetYjsDocumentUpdateRows.mockResolvedValue([
      makeRow("u1", "2026-04-19T10:00:00.000Z"),
    ]);
    mockBuildRichTextVersionHistory.mockReturnValue([
      { ...makeEntry("u1", "My edit"), actorId: "user_1" },
    ]);

    render(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() => expect(screen.getByText(/My edit/)).toBeTruthy());
    expect(screen.getByText("You")).toBeTruthy();
    const avatar = screen
      .getByTestId("avatar-user_1")
      .querySelector("img") as HTMLImageElement;
    expect(avatar.src).toBe(
      "https://api.example.com/v1/account/avatar/user_1"
    );
  });

  it("loads Gravatar when a resolved member has no uploaded image", async () => {
    mockGetYjsDocumentUpdateRows.mockResolvedValue([
      makeRow("u1", "2026-04-19T10:00:00.000Z"),
    ]);
    mockBuildRichTextVersionHistory.mockReturnValue([
      { ...makeEntry("u1", "Collaborator edit"), actorId: "user_2" },
    ]);

    render(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() =>
      expect(screen.getByText(/Collaborator edit/)).toBeTruthy()
    );
    expect(screen.getByText("Alice")).toBeTruthy();
    const avatar = screen
      .getByTestId("avatar-user_2")
      .querySelector("img") as HTMLImageElement;
    expect(avatar.src).toBe("https://gravatar.test/alice%40example.com");
  });

  it("falls back to short-id collaborator label for users not in the org map", async () => {
    mockGetYjsDocumentUpdateRows.mockResolvedValue([
      makeRow("u1", "2026-04-19T10:00:00.000Z"),
    ]);
    mockBuildRichTextVersionHistory.mockReturnValue([
      { ...makeEntry("u1", "Unknown edit"), actorId: "user_unknown_9999" },
    ]);

    render(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() => expect(screen.getByText(/Unknown edit/)).toBeTruthy());
    expect(screen.getByText(/Collaborator user_unk/)).toBeTruthy();
    expect(screen.getByTestId("avatar-user_unknown_9999")).toBeTruthy();
  });

  it("renders system label and empty avatar for null-author entries", async () => {
    mockGetYjsDocumentUpdateRows.mockResolvedValue([
      makeRow("u1", "2026-04-19T10:00:00.000Z"),
    ]);
    mockBuildRichTextVersionHistory.mockReturnValue([
      { ...makeEntry("u1", "System change"), actorId: null },
    ]);

    render(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() => expect(screen.getByText(/System change/)).toBeTruthy());
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByTestId("avatar-none")).toBeTruthy();
  });

  it("shows error state when snapshot refresh fails", async () => {
    mockGetYjsDocumentUpdateRows.mockRejectedValue(new Error("boom"));

    render(<RichTextVersionHistoryPanel storage={storage} resourceId="item_1" />);

    await waitFor(() =>
      expect(
        screen.getByText("extensions.catalog.lunaris.rich-text.history.errorTitle")
      ).toBeTruthy()
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });
});

function makeRow(id: string, createdAt: string) {
  return {
    createdAt: createdAt,
    id,
    updateBase64: id,
    userId: "user_1",
  };
}

function makeEntry(id: string, text: string) {
  return {
    actorId: "user_1",
    addedCount: 1,
    createdAt: "2026-04-19T10:00:00.000Z",
    endedAt: "2026-04-19T10:00:00.000Z",
    id,
    lines: [{ kind: "added" as const, text }],
    removedCount: 0,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
