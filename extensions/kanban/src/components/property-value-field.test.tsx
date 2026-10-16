import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PropertyDefinition } from "../types";
import { PropertyValueField } from "./property-value-field";

const sdkMocks = vi.hoisted(() => ({
  openEntityReference: vi.fn().mockResolvedValue(true),
  searchEntityReferences: vi.fn().mockResolvedValue([
    {
      documentId: null,
      kind: "resource",
      name: "Budget.pdf",
      resourceTypeId: "lunaris.file",
      workspaceName: "Launch",
      reference: {
        resourceId: "item-2",
        workspaceId: "workspace-1",
        type: "workspace-resource",
      },
    },
    {
      documentId: "doc-1",
      kind: "resource",
      name: "Launch brief",
      resourceTypeId: "lunaris.rich-text",
      workspaceName: "Launch",
      reference: {
        resourceId: "item-1",
        workspaceId: "workspace-1",
        type: "workspace-resource",
      },
    },
    {
      documentId: null,
      kind: "folder",
      name: "Planning",
      resourceTypeId: null,
      workspaceName: "Launch",
      reference: {
        resourceId: "folder-1",
        workspaceId: "workspace-1",
        type: "workspace-resource",
      },
    },
  ]),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useApiTransport: () => ({ baseUrl: "https://api.example.com/" }),
  useEntityReferenceSearch: () => sdkMocks.searchEntityReferences,
  useOrganizationNavigation: () => ({
    openEntityReference: sdkMocks.openEntityReference,
  }),
}));

vi.mock("@lunarisapp/ui/components/avatar", () => ({
  Avatar: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
  AvatarFallback: ({ children }: { children: ReactNode }) => <>{children}</>,
  AvatarGroup: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarGroupCount: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock("@lunarisapp/ui/hooks/use-gravatar-url", () => ({
  useGravatarUrl: (email?: string | null) =>
    email ? `https://gravatar.test/${encodeURIComponent(email)}` : undefined,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) =>
      ({
        "extensions.catalog.lunaris.kanban.clear": "Clear",
        "extensions.catalog.lunaris.kanban.noPeopleFound": "No people found",
        "extensions.catalog.lunaris.kanban.noResourcesFound":
          "No resources found",
        "extensions.catalog.lunaris.kanban.resourceSearchError":
          "Couldn’t search resources",
        "extensions.catalog.lunaris.kanban.openResource": "Open resource",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.date":
          "Pick a date",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.resource":
          "Select a resource",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.multi-select":
          "Select options",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.number":
          "Enter a number",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.people":
          "Select people",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.select":
          "Select an option",
        "extensions.catalog.lunaris.kanban.propertyPlaceholders.text":
          "Enter text",
        "extensions.catalog.lunaris.kanban.searchPeople": "Search people",
        "extensions.catalog.lunaris.kanban.searchResources": "Search resources",
        "extensions.catalog.lunaris.kanban.searchingResources":
          "Searching resources…",
        "extensions.catalog.lunaris.kanban.time": "Time",
        "extensions.catalog.lunaris.kanban.validation.finiteNumber":
          "Enter a finite decimal number.",
      })[key] ?? key,
  }),
}));

describe("PropertyValueField", () => {
  it("uses a contextual empty label when provided", () => {
    render(
      <PropertyValueField
        emptyLabel="Labels"
        onValueChange={vi.fn()}
        property={{
          id: "labels",
          name: "Labels",
          options: [],
          type: "multi-select",
        }}
        value={undefined}
      />
    );

    expect(screen.getByRole("button", { name: "Labels" }).textContent).toBe(
      "Labels"
    );
    expect(screen.queryByText("Select options")).toBeNull();
  });

  it("commits Text on blur and clears an empty value", () => {
    const onValueChange = vi.fn();
    const property: PropertyDefinition = {
      id: "note",
      name: "Note",
      type: "text",
    };
    const view = render(
      <PropertyValueField
        onValueChange={onValueChange}
        property={property}
        value="Draft"
      />
    );
    const input = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(input, { target: { value: "Ship safely" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith("Ship safely");

    view.rerender(
      <PropertyValueField
        onValueChange={onValueChange}
        property={property}
        value="Ship safely"
      />
    );
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it("cancels Text edits with Escape", () => {
    const onValueChange = vi.fn();
    render(
      <PropertyValueField
        onValueChange={onValueChange}
        property={{ id: "note", name: "Note", type: "text" }}
        value="Draft"
      />
    );
    const input = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(input, { target: { value: "Do not save" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect((input as HTMLInputElement).value).toBe("Draft");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("writes explicit Checkbox booleans and respects read-only mode", () => {
    const onValueChange = vi.fn();
    const property: PropertyDefinition = {
      id: "blocked",
      name: "Blocked",
      type: "checkbox",
    };
    const view = render(
      <PropertyValueField
        onValueChange={onValueChange}
        property={property}
        value={false}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Blocked" }));
    expect(onValueChange).toHaveBeenCalledWith(true);

    view.rerender(
      <PropertyValueField
        disabled
        onValueChange={onValueChange}
        property={property}
        value={true}
      />
    );
    onValueChange.mockClear();
    fireEvent.click(screen.getByRole("checkbox", { name: "Blocked" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("renders Multi-select tags and a date-only value", () => {
    const labels: PropertyDefinition = {
      id: "labels",
      name: "Labels",
      options: [
        { color: "#f00", id: "bug", name: "Bug" },
        { color: "#00f", id: "feature", name: "Feature" },
      ],
      type: "multi-select",
    };
    const view = render(
      <PropertyValueField
        onValueChange={vi.fn()}
        property={labels}
        value={["bug", "feature"]}
      />
    );
    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.getByText("Feature").parentElement?.className).not.toContain(
      "flex-1"
    );

    view.rerender(
      <PropertyValueField
        onValueChange={vi.fn()}
        property={{ id: "due", name: "Due", type: "date" }}
        value="2026-08-25"
      />
    );
    expect(screen.getByRole("button", { name: "Due" }).textContent).toContain(
      "Aug"
    );
  });

  it("caps crowded Multi-select summaries", () => {
    render(
      <PropertyValueField
        onValueChange={vi.fn()}
        property={{
          id: "labels",
          name: "Labels",
          options: [
            { color: "#f00", id: "bug", name: "Bug" },
            { color: "#00f", id: "feature", name: "Feature" },
            { color: "#0f0", id: "docs", name: "Documentation" },
          ],
          type: "multi-select",
        }}
        value={["bug", "feature", "docs"]}
      />
    );

    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.getByText("Feature")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.queryByText("Documentation")).toBeNull();
  });

  it("toggles Multi-select options without nested controls", () => {
    const onValueChange = vi.fn();
    render(
      <PropertyValueField
        onValueChange={onValueChange}
        property={{
          id: "labels",
          name: "Labels",
          options: [{ color: "#f00", id: "bug", name: "Bug" }],
          type: "multi-select",
        }}
        value={["bug"]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Labels" }));
    const option = screen.getByRole("button", { name: "Bug" });

    expect(option.querySelector("button")).toBeNull();
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("renders Select choices and stale People IDs", () => {
    const view = render(
      <PropertyValueField
        onValueChange={vi.fn()}
        property={{
          id: "status",
          name: "Status",
          options: [{ color: "#00f", id: "done", name: "Done" }],
          type: "select",
        }}
        value="done"
      />
    );
    expect(screen.getByText("Done")).toBeTruthy();

    view.rerender(
      <PropertyValueField
        onValueChange={vi.fn()}
        property={{ id: "assignees", name: "Assignees", type: "people" }}
        value={["removed-user"]}
      />
    );
    expect(screen.getByTitle("removed-user")).toBeTruthy();
  });

  it("renders composer choices as one aligned control", () => {
    const view = render(
      <PropertyValueField
        appearance="composer"
        onValueChange={vi.fn()}
        property={{
          id: "status",
          name: "Status",
          options: [{ color: "#00f", id: "done", name: "Done" }],
          type: "select",
        }}
        value="done"
      />
    );
    const status = screen.getByRole("combobox", { name: "Status" });
    expect(status.className).toContain("h-8!");
    expect(status.querySelector('[data-slot="badge"]')).toBeNull();
    expect(status.querySelector("svg")).toBeTruthy();

    fireEvent.click(status);
    const selectContent = document.querySelector(
      '[data-slot="select-content"]'
    );
    expect(selectContent?.getAttribute("data-align-trigger")).toBe("false");
    expect(selectContent?.className).toContain("p-2.5");
    expect(selectContent?.className).toContain("w-[min(16rem");
    expect(
      selectContent?.querySelector('[data-slot="select-item"]')?.className
    ).toContain("py-1.5");

    view.rerender(
      <PropertyValueField
        appearance="composer"
        onValueChange={vi.fn()}
        property={{
          id: "labels",
          name: "Labels",
          options: [
            { color: "#f00", id: "bug", name: "Bug" },
            { color: "#00f", id: "feature", name: "Feature" },
            { color: "#0f0", id: "docs", name: "Documentation" },
          ],
          type: "multi-select",
        }}
        value={["bug", "feature", "docs"]}
      />
    );
    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.queryByText("Feature")).toBeNull();
    expect(screen.queryByText("Documentation")).toBeNull();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("keeps composer Date and Checkbox empty states visually consistent", () => {
    const onValueChange = vi.fn();
    const view = render(
      <PropertyValueField
        appearance="composer"
        emptyLabel="Due"
        onValueChange={onValueChange}
        property={{ id: "due", name: "Due", type: "date" }}
        value={undefined}
      />
    );
    expect(screen.getByText("Due").className).toContain(
      "text-muted-foreground"
    );

    view.rerender(
      <PropertyValueField
        appearance="composer"
        onValueChange={onValueChange}
        property={{ id: "blocked", name: "Blocked", type: "checkbox" }}
        value={false}
      />
    );
    const checkbox = screen.getByRole("checkbox", { name: "Blocked" });
    const field = checkbox.parentElement;
    expect(field?.className).toContain("rounded-lg");
    expect(field?.className).toContain("bg-background/70");
    expect(field?.className).toContain("dark:bg-input/30");

    fireEvent.click(checkbox);
    expect(onValueChange).toHaveBeenCalledWith(true);

    view.rerender(
      <PropertyValueField
        appearance="composer"
        onValueChange={onValueChange}
        property={{ id: "blocked", name: "Blocked", type: "checkbox" }}
        value={true}
      />
    );
    const checked = screen.getByRole("checkbox", { name: "Blocked" });
    expect(checked.getAttribute("data-checked")).toBe("");
    expect(checked.parentElement?.className).toContain("bg-background/70");
  });

  it("renders People avatars from Gravatar", () => {
    const { container } = render(
      <PropertyValueField
        onValueChange={vi.fn()}
        people={
          new Map([
            [
              "user-1",
              {
                email: "mina@example.com",
                id: "user-1",
                name: "Mina Park",
              },
            ],
          ])
        }
        property={{ id: "assignees", name: "Assignees", type: "people" }}
        value={["user-1"]}
      />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://gravatar.test/mina%40example.com"
    );
  });

  it("searches, assigns, and opens Resource references", async () => {
    sdkMocks.openEntityReference.mockClear();
    sdkMocks.searchEntityReferences.mockClear();
    const onValueChange = vi.fn();
    const property: PropertyDefinition = {
      id: "resource",
      name: "Related document",
      type: "resource",
    };
    const view = render(
      <PropertyValueField
        onValueChange={onValueChange}
        property={property}
        value={undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Related document" }));
    const result = await screen.findByRole("button", {
      name: /Launch brief Launch/,
    });
    expect(screen.queryByText("Planning")).toBeNull();
    expect(screen.getByText("Budget.pdf")).toBeTruthy();
    fireEvent.click(result);
    expect(onValueChange).toHaveBeenCalledWith({
      resourceId: "item-1",
      name: "Launch brief",
      resourceTypeId: "lunaris.rich-text",
      workspaceId: "workspace-1",
      workspaceName: "Launch",
    });

    view.rerender(
      <PropertyValueField
        onValueChange={onValueChange}
        property={property}
        value={{
          resourceId: "item-1",
          name: "Launch brief",
          resourceTypeId: "lunaris.rich-text",
          workspaceId: "workspace-1",
          workspaceName: "Launch",
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Related document" }));
    const openResource = await screen.findByRole("button", {
      name: "Open resource",
    });
    expect(openResource.querySelector("svg")).toBeTruthy();
    fireEvent.click(openResource);
    await waitFor(() =>
      expect(sdkMocks.openEntityReference).toHaveBeenCalledWith({
        resourceId: "item-1",
        workspaceId: "workspace-1",
        type: "workspace-resource",
      })
    );
  });

  it("does not repeat the Resource icon in metadata values", () => {
    sdkMocks.openEntityReference.mockClear();
    render(
      <PropertyValueField
        appearance="metadata"
        onValueChange={vi.fn()}
        property={{ id: "resource", name: "Resource", type: "resource" }}
        value={{
          resourceId: "item-1",
          name: "Launch brief",
          resourceTypeId: "lunaris.rich-text",
          workspaceId: "workspace-1",
          workspaceName: "Launch",
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Resource" }).querySelector("svg")
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open resource" }));
    expect(sdkMocks.openEntityReference).toHaveBeenCalledWith({
      resourceId: "item-1",
      workspaceId: "workspace-1",
      type: "workspace-resource",
    });
  });

  it("loads uploaded People avatars through the account endpoint", () => {
    const { container } = render(
      <PropertyValueField
        onValueChange={vi.fn()}
        people={
          new Map([
            [
              "user/1",
              {
                email: "mina@example.com",
                id: "user/1",
                image: "stored-avatar",
                name: "Mina Park",
              },
            ],
          ])
        }
        property={{ id: "assignees", name: "Assignees", type: "people" }}
        value={["user/1"]}
      />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://api.example.com/v1/account/avatar/user%2F1"
    );
  });

  it("renders quiet named metadata values for choices and People", () => {
    const people = new Map([
      [
        "user-1",
        {
          email: "mina@example.com",
          id: "user-1",
          name: "Mina Park",
        },
      ],
      ["user-2", { id: "user-2", name: "Omar" }],
      ["user-3", { id: "user-3", name: "Tess" }],
    ]);
    const view = render(
      <PropertyValueField
        appearance="metadata"
        onValueChange={vi.fn()}
        property={{
          id: "status",
          name: "Status",
          options: [{ color: "#00f", id: "done", name: "Done" }],
          type: "select",
        }}
        value="done"
      />
    );
    const status = screen.getByRole("combobox", { name: "Status" });

    expect(status.className).toContain("border-transparent");
    expect(status.className).toContain("[&>svg:last-child]:hidden");
    expect(status.querySelector('[style*="background-color"]')).toBeTruthy();
    expect(status.querySelector('[data-slot="badge"]')).toBeNull();

    fireEvent.click(status);
    const metadataMenu = document.querySelector('[data-slot="select-content"]');
    expect(metadataMenu?.getAttribute("data-align-trigger")).toBe("false");
    expect(metadataMenu?.className).toContain("p-2.5");
    expect(metadataMenu?.className).toContain("w-[min(16rem");
    fireEvent.click(status);

    view.rerender(
      <PropertyValueField
        appearance="metadata"
        onValueChange={vi.fn()}
        property={{
          id: "labels",
          name: "Labels",
          options: [
            { color: "#f00", id: "bug", name: "Bug" },
            { color: "#00f", id: "feature", name: "Feature" },
            { color: "#0f0", id: "docs", name: "Documentation" },
          ],
          type: "multi-select",
        }}
        value={["bug", "feature", "docs"]}
      />
    );

    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.getByText("Feature")).toBeTruthy();
    expect(screen.getByText("Documentation")).toBeTruthy();
    expect(screen.queryByText("+2")).toBeNull();

    view.rerender(
      <PropertyValueField
        appearance="metadata"
        onValueChange={vi.fn()}
        people={people}
        property={{ id: "assignees", name: "Assignees", type: "people" }}
        value={["user-1", "user-2", "user-3"]}
      />
    );

    expect(screen.getByText("Mina Park")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByTitle("Mina Park").className).toContain("size-6");
  });

  it("validates non-finite Number drafts", () => {
    const onValueChange = vi.fn();
    render(
      <PropertyValueField
        onValueChange={onValueChange}
        property={{ id: "estimate", name: "Estimate", type: "number" }}
        value={2}
      />
    );
    const input = screen.getByRole("spinbutton", { name: "Estimate" });
    fireEvent.change(input, { target: { value: "1e999" } });
    fireEvent.blur(input);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("finite decimal");
  });
});
