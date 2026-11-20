/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResourceContentSearch } from "../hooks/useResourceContentSearch";
import { SearchProvider } from "../hooks/useSearchDialog";

import { SearchDialogMenu } from "./search-dialog";

vi.mock("../../workspace", () => ({
  useCurrentWorkspace: () => {
    throw new Error("Homepage has no workspace");
  },
}));
vi.mock("../../workspace-explorer", () => ({
  useWorkspaceResources: () => {
    throw new Error("Homepage has no explorer");
  },
}));
vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => {
    throw new Error("Homepage has no workbench");
  },
  useOrganizationViewState: () => {
    throw new Error("Homepage has no workbench");
  },
}));
vi.mock("../../../extensions/use-preload-resource-renderer", () => ({
  usePreloadResourceRenderer: vi.fn(),
}));
vi.mock("../search-index-coordinator", () => ({
  SearchIndexCoordinator: () => null,
}));
vi.mock("../hooks/useCommandHotkeys", () => ({ useCommandHotkeys: vi.fn() }));
vi.mock("../hooks/useSearchResourceTypes", () => ({
  useSearchResourceTypes: () => new Map(),
}));
vi.mock("../hooks/useWorkspaceSearch", async () => {
  const { searchWorkspaces } = await import("../workspaces");
  return {
    useWorkspaceSearch: (query: string) =>
      searchWorkspaces(
        [{ id: "w", name: "Recreate the outline", slug: "recreate" }],
        query,
        "",
        "Untitled"
      ),
  };
});
vi.mock("../hooks/useResourceSearch", () => ({ useResourceSearch: () => [] }));
vi.mock("../hooks/useResourceContentSearch", () => ({
  useResourceContentSearch: vi.fn((query: string) =>
    query === "needle"
      ? [
          {
            id: "content-resource-1",
            resourceId: "resource-1",
            label: "Project notes",
            pluginId: "lunaris.rich-text",
            workspaceId: "workspace-1",
            workspaceSlug: "writing",
            workspaceName: "Writing",
            preview: "A needle in the content",
            type: "resource",
          },
        ]
      : []
  ),
}));
vi.mock("@repo/features/region", () => ({
  useRegion: () => ({ pathWithRegion: (path: string) => `/eu${path}` }),
}));
vi.mock("@tanstack/react-hotkeys", () => ({ useHotkey: vi.fn() }));
vi.mock("@repo/features/hotkeys", () => ({
  HOTKEYS: { "toggle-search": {} },
  createHotkeyOptions: () => ({}),
  useResolvedHotkeyBinding: () => "Mod+K",
  useHotkeyDisplay: () => "⌘K",
  formatHotkeyDisplay: () => "",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("../command-actions", () => ({ createCommandActions: vi.fn() }));
afterEach(cleanup);

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function renderHomepage(createWorkspace = vi.fn(), askAgent = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/eu/acme"]}>
      <Routes>
        <Route
          path="/eu/:organizationSlug/*"
          element={
            <>
              <SearchProvider
                inline
                indexingReady={false}
                organizationId="org-1"
              >
                <SearchDialogMenu
                  inline
                  onAskAgent={askAgent}
                  commandActions={{ "create-workspace": createWorkspace }}
                />
              </SearchProvider>
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("homepage command menu", () => {
  it("focuses the composer on mount and shows results only for a query", async () => {
    renderHomepage();
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);
    expect(useResourceContentSearch).toHaveBeenLastCalledWith("", 300, false);
    expect(input.tagName).toBe("INPUT");
    expect(screen.queryByRole("button", { name: "agentWork.send" })).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("button", { name: "search.attachResource" })
    ).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "search.addFilterLabel" })
    );
    expect(await screen.findByRole("listbox")).toBeTruthy();
    fireEvent.change(input, { target: { value: " " } });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens full-text matches in their workspace without workspace providers", async () => {
    renderHomepage();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "needle" },
    });
    expect(useResourceContentSearch).toHaveBeenLastCalledWith(
      "needle",
      300,
      true
    );
    fireEvent.click(await screen.findByText("Project notes"));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/eu/acme/writing/resource-1"
      )
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("completes filters and offers the typed prompt to Agent", async () => {
    const askAgent = vi.fn();
    renderHomepage(vi.fn(), askAgent);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@work" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect((input as HTMLInputElement).value).toContain("@workspace:");
    fireEvent.change(input, {
      target: { value: "Outline the next chapter" },
    });
    fireEvent.click(await screen.findByText("search.askAgent"));
    expect(askAgent).toHaveBeenCalledWith("Outline the next chapter");
  });

  it("preserves the draft when focus leaves and returns", async () => {
    const askAgent = vi.fn();
    renderHomepage(vi.fn(), askAgent);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Summarize this" } });
    const filter = screen.getByRole("button", {
      name: "search.addFilterLabel",
    });
    const list = await screen.findByRole("listbox");
    expect(
      filter.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Summarize this");
    fireEvent.focus(input);
    expect(await screen.findByRole("listbox")).toBeTruthy();
    fireEvent.click(await screen.findByText("search.askAgent"));
    expect(askAgent).toHaveBeenCalledWith("Summarize this");
  });

  it("shows mid-word hits only when no search group has a word-start hit", async () => {
    renderHomepage();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "create" } });
    expect(await screen.findByText("workspaces.createWorkspace")).toBeTruthy();
    expect(screen.queryByText("Recreate the outline")).toBeNull();
    fireEvent.change(input, { target: { value: "ecreate out" } });
    expect(await screen.findByText("Recreate the outline")).toBeTruthy();
    expect(screen.getByText("search.askAgent")).toBeTruthy();
    fireEvent.change(input, { target: { value: '"ecreate" out' } });
    expect(screen.queryByText("Recreate the outline")).toBeNull();
  });

  it("runs homepage commands and hides workspace-only actions", async () => {
    const createWorkspace = vi.fn();
    renderHomepage(createWorkspace);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "create" },
    });
    expect(screen.queryByText("commands.renameResource")).toBeNull();
    fireEvent.click(await screen.findByText("workspaces.createWorkspace"));
    expect(createWorkspace).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });
});
