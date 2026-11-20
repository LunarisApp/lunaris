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
vi.mock("../hooks/useWorkspaceSearch", () => ({
  useWorkspaceSearch: () => [],
}));
vi.mock("../hooks/useResourceSearch", () => ({ useResourceSearch: () => [] }));
vi.mock("../hooks/useResourceContentSearch", () => ({
  useResourceContentSearch: (query: string) =>
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
      : [],
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
const resource = {
  kind: "resource",
  name: "Chapter notes",
  reference: { type: "workspace-resource", workspaceId: "w", resourceId: "r" },
  workspaceName: "Writing",
  resourceTypeId: "lunaris.rich-text",
  storage: {},
} as const;
const searchAttachments = async () => [resource];

function renderHomepage(createWorkspace = vi.fn(), askAgent = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/eu/acme"]}>
      <Routes>
        <Route
          path="/eu/:organizationSlug/*"
          element={
            <>
              <SearchProvider indexingReady={false} organizationId="org-1">
                <SearchDialogMenu
                  searchAttachments={searchAttachments}
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
  screen.getByRole("combobox").focus();
}

describe("homepage command menu", () => {
  it("shows results only while the focused field has a query", async () => {
    renderHomepage();
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
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
    fireEvent.click(await screen.findByText("Project notes"));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/eu/acme/writing/resource-1"
      )
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("completes filters and offers the typed prompt to Agent Work", async () => {
    const askAgent = vi.fn();
    renderHomepage(vi.fn(), askAgent);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@work" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect((input as HTMLInputElement).value).toContain("@workspace:");
    fireEvent.change(input, { target: { value: "Outline the next chapter" } });
    fireEvent.click(await screen.findByText("search.askAgent"));
    expect(askAgent).toHaveBeenCalledWith("Outline the next chapter", []);
  });

  it("sends the typed prompt with the resource selected in the picker", async () => {
    const askAgent = vi.fn();
    renderHomepage(vi.fn(), askAgent);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Summarize this" } });
    fireEvent.click(
      screen.getByRole("button", { name: "search.attachResource" })
    );
    fireEvent.click(await screen.findByText("Chapter notes"));
    expect((input as HTMLInputElement).value).toBe("Summarize this");
    fireEvent.click(screen.getByRole("button", { name: "agentWork.send" }));
    expect(askAgent).toHaveBeenCalledWith("Summarize this", [resource]);
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
