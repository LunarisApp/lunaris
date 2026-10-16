/** @vitest-environment happy-dom */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  createContext,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { object, string } from "zod";
import { ResourceCapacityExceededError } from "@repo/features/entitlements";
import {
  CreateWorkspaceDialog,
  CreateWorkspaceLauncher,
  ImportObsidianWorkspaceDialog,
} from "./index";

const {
  installWorkspaceExtensionMock,
  createWorkspaceMock,
  importObsidianWorkspaceMock,
  resourceCapacityCommitMock,
  resourceCapacityRollbackMock,
  pickObsidianImportDirectoryMock,
  posthogCaptureMock,
  replaceWorkspaceExtensionsMock,
  reserveResourceCapacityMock,
  toastErrorMock,
  useWorkspaceSlugCollisionMock,
} = vi.hoisted(() => ({
  installWorkspaceExtensionMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
  importObsidianWorkspaceMock: vi.fn(),
  resourceCapacityCommitMock: vi.fn(),
  resourceCapacityRollbackMock: vi.fn(),
  pickObsidianImportDirectoryMock: vi.fn(),
  posthogCaptureMock: vi.fn(),
  replaceWorkspaceExtensionsMock: vi.fn(),
  reserveResourceCapacityMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useWorkspaceSlugCollisionMock: vi.fn(),
}));

vi.mock("@repo/features/entitlements", () => {
  class ResourceCapacityExceededError extends Error {}
  return {
    getResourceCapacityErrorMessageKey: (
      error: unknown,
      fallbackKey: string
    ) =>
      error instanceof ResourceCapacityExceededError
        ? "errors.reason.entitlements.resourceLimit.desc"
        : fallbackKey,
    ResourceCapacityExceededError,
    useReserveResourceCapacity: () => reserveResourceCapacityMock,
  };
});

vi.mock("@repo/data/core", () => ({
  usePowerSync: () => ({}),
}));

vi.mock("@repo/data/features/workspace-extensions", () => ({
  createWorkspaceExtensionsService: () => ({
    install: installWorkspaceExtensionMock,
  }),
  DEFAULT_EXCALIDRAW_EXTENSION: {
    descriptor: null,
    registryId: "lunaris-official",
    version: "0.0.1",
  },
  replaceWorkspaceExtensions: replaceWorkspaceExtensionsMock,
}));

vi.mock("@repo/data/features/workspaces", async () => ({
  createWorkspace: createWorkspaceMock,
  createWorkspaceSchema: object({
    name: string().min(3),
    organizationId: string(),
    slug: string().optional(),
    visibility: string(),
  }),
  workspaceSlugSchema: string().min(3),
  useWorkspaceSlugCollision: useWorkspaceSlugCollisionMock,
}));

vi.mock("@lunarisapp/ui/brand-icons", () => ({
  Obsidian: (props: Record<string, unknown>) => (
    <svg data-testid="obsidian-icon" {...props} />
  ),
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@lunarisapp/ui/components/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@lunarisapp/ui/blocks/responsive-dropdown-menu", () => ({
  ResponsiveDropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  ResponsiveDropdownMenuShortcut: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  ResponsiveDropdownMenuTrigger: ({ render }: { render: ReactNode }) => (
    <div>{render}</div>
  ),
}));

vi.mock("@lunarisapp/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  DropdownMenuTrigger: ({ render }: { render: ReactNode }) => (
    <div>{render}</div>
  ),
}));

vi.mock("@lunarisapp/ui/components/field", () => ({
  Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FieldError: ({
    errors,
    id,
  }: {
    errors?: Array<{ message?: string } | undefined>;
    id?: string;
  }) => {
    const messages = [
      ...new Set(errors?.map((error) => error?.message).filter(Boolean)),
    ];

    if (!messages.length) {
      return null;
    }

    return (
      <div id={id} role="alert">
        {messages.join(", ")}
      </div>
    );
  },
  FieldLabel: ({
    children,
    htmlFor,
  }: {
    children: ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  FieldTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@lunarisapp/ui/components/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const SelectContext = createContext<{
  onValueChange?: (value: string) => void;
  value?: string;
} | null>(null);

vi.mock("@lunarisapp/ui/components/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <SelectContext.Provider value={{ onValueChange, value }}>
      <div>{children}</div>
    </SelectContext.Provider>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    const context = useContext(SelectContext);
    return (
      <button onClick={() => context?.onValueChange?.(value)} type="button">
        {children}
      </button>
    );
  },
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
  ),
  SelectValue: ({
    children,
    placeholder,
  }: {
    children?: ((value: string | null) => ReactNode) | ReactNode;
    placeholder?: string;
  }) => {
    const context = useContext(SelectContext);
    const value = context?.value ?? null;

    if (typeof children === "function") {
      return <>{children(value) ?? placeholder}</>;
    }

    return <>{value ?? placeholder}</>;
  },
}));

vi.mock("@lunarisapp/ui/icons", async () => {
  const actual = await vi.importActual<typeof import("@lunarisapp/ui/icons")>(
    "@lunarisapp/ui/icons"
  );

  const HugeiconsIcon = forwardRef<
    SVGSVGElement,
    ComponentProps<typeof actual.HugeiconsIcon>
  >(function HugeiconsIcon(props, ref) {
    return <svg data-testid="hugeicon" ref={ref} {...props} />;
  });

  return {
    ...actual,
    BookOpen01Icon: [],
    FolderAddIcon: [],
    HugeiconsIcon,
    Upload01Icon: [],
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number>) => {
      if (key === "workspaces.importSummary" && options) {
        return `${options.folders} folders, ${options.files} files, ${options.markdown} Markdown docs, ${options.skipped} skipped`;
      }

      return (
        {
          "common.comingSoon": "Coming soon",
          "workspaces.browseTemplates": "Browse templates",
          "workspaces.chooseFolder": "Choose folder",
          "workspaces.createEmpty": "Create empty",
          "workspaces.createEmptyDescription": "Start from a blank workspace",
          "workspaces.createWorkspace": "Create Workspace",
          "workspaces.creating": "Creating...",
          "workspaces.importFailed": "Import failed",
          "errors.reason.entitlements.resourceLimit.desc":
            "Upgrade to add more items",
          "workspaces.importFolder": "Folder",
          "workspaces.importFromObsidian": "Import from Obsidian",
          "workspaces.importFromObsidianDescription":
            "Import a Markdown folder",
          "workspaces.importWorkspace": "Import Workspace",
          "workspaces.importing": "Importing...",
          "workspaces.noFolderSelected": "No folder selected",
          "workspaces.workspaceName": "Name",
          "workspaces.workspaceNamePlaceholder": "My Workspace",
          "workspaces.workspaceVisibility": "Visibility",
          "workspaces.workspaceVisibility.shared": "Shared",
          "workspaces.workspaceVisibility.shared.description":
            "All members can access this workspace.",
          "workspaces.workspaceVisibility.private": "Private",
          "workspaces.workspaceVisibility.private.description":
            "Synced to the cloud and accessible only to you.",
          "workspaces.workspaceVisibility.local": "Local",
          "workspaces.workspaceVisibility.local.description":
            "Files remain only on this device.",
          "workspaces.workspaceVisibilityDescription":
            "Choose who can access this workspace.",
          "workspaces.workspaceVisibilityLocked":
            "Cloud sync is not available for this account. New workspaces stay local.",
          "workspaces.workspaceSlug": "Slug",
          "workspaces.workspaceSlugPlaceholder": "my-workspace",
          "workspaces.workspaceSlugTaken":
            "Slug already exists in this organization",
        } as Record<string, string>
      )[key];
    },
  }),
}));

vi.mock("../extensions/extension-registry-context", () => ({
  useExtensionRegistry: () => ({
    allExtensionIds: ["lunaris.rich-text", "lunaris.kanban", "lunaris.file"],
  }),
}));

vi.mock("./obsidian-folder-picker", () => ({
  pickObsidianImportDirectory: pickObsidianImportDirectoryMock,
}));

vi.mock("./obsidian-import-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./obsidian-import-service")>();
  return {
    ...actual,
    importObsidianWorkspace: importObsidianWorkspaceMock,
  };
});

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    parseError: vi.fn(),
  };
});

vi.mock("posthog-js", () => ({
  default: {
    capture: posthogCaptureMock,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  importObsidianWorkspaceMock.mockResolvedValue({
    workspaceId: "workspace_import",
    stats: {
      convertedMarkdownCount: 1,
      folderCount: 1,
      originalFileCount: 2,
      skippedCount: 0,
    },
  });
  reserveResourceCapacityMock.mockResolvedValue({
    commit: resourceCapacityCommitMock,
    rollback: resourceCapacityRollbackMock,
  });
  pickObsidianImportDirectoryMock.mockResolvedValue({
    name: "My Vault",
    children: [
      {
        kind: "file",
        name: "Note.md",
        file: new File(["# Note"], "Note.md", { type: "text/markdown" }),
      },
    ],
  });
  useWorkspaceSlugCollisionMock.mockImplementation(
    ({ organizationId, slug }: { organizationId?: string; slug?: string }) => ({
      data:
        slug === "taken-workspace" && organizationId === "org_1"
          ? [{ id: "workspace_existing" }]
          : [],
      hasCollision: slug === "taken-workspace" && organizationId === "org_1",
    })
  );
});

describe("CreateWorkspaceLauncher", () => {
  it("renders 3 choices and opens empty/import actions", async () => {
    const user = userEvent.setup();
    const onCreateEmpty = vi.fn();
    const onImportObsidian = vi.fn();

    render(
      <CreateWorkspaceLauncher
        onCreateEmpty={onCreateEmpty}
        onImportObsidian={onImportObsidian}
        trigger={<button type="button">Create</button>}
      />
    );

    expect(screen.getByText("Create empty")).toBeTruthy();
    expect(screen.getByText("Import from Obsidian")).toBeTruthy();
    expect(screen.getByText("Browse templates")).toBeTruthy();

    await user.click(screen.getByText("Create empty"));
    await user.click(screen.getByText("Import from Obsidian"));
    expect(onCreateEmpty).toHaveBeenCalledTimes(1);
    expect(onImportObsidian).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Browse templates").closest("button")?.disabled
    ).toBe(true);
  });
});

describe("ImportObsidianWorkspaceDialog", () => {
  it("selects a folder, fills workspace fields, and imports", async () => {
    const user = userEvent.setup();

    render(
      <ImportObsidianWorkspaceDialog
        onOpenChange={vi.fn()}
        open
        orgId="org_1"
      />
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Import Workspace",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "My Vault");
      expect(screen.getByLabelText("Slug")).toHaveProperty("value", "my-vault");
      expect(screen.getByRole("status").textContent).toBe("My Vault");
    });

    await user.click(screen.getByRole("button", { name: "Import Workspace" }));

    await waitFor(() => {
      expect(importObsidianWorkspaceMock).toHaveBeenCalledWith({
        allExtensionIds: expect.arrayContaining([
          "lunaris.rich-text",
          "lunaris.file",
        ]),
        data: {
          name: "My Vault",
          organizationId: "org_1",
          slug: "my-vault",
          visibility: "shared",
        },
        db: {},
        directory: expect.objectContaining({ name: "My Vault" }),
        resourceCapacityReservation: {
          commit: resourceCapacityCommitMock,
          rollback: resourceCapacityRollbackMock,
        },
      });
      expect(reserveResourceCapacityMock).toHaveBeenCalledWith(3);
      expect(posthogCaptureMock).toHaveBeenCalledWith("workspace_created", {
        template: "obsidian-import",
        converted_markdown_count: 1,
        folder_count: 1,
        original_file_count: 2,
        skipped_count: 0,
        visibility: "shared",
      });
    });
  });

  it("preflights item capacity before importing", async () => {
    const user = userEvent.setup();
    reserveResourceCapacityMock.mockRejectedValue(
      new ResourceCapacityExceededError(25)
    );

    render(
      <ImportObsidianWorkspaceDialog
        onOpenChange={vi.fn()}
        open
        orgId="org_1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "My Vault")
    );
    await user.click(screen.getByRole("button", { name: "Import Workspace" }));

    await waitFor(() =>
      expect(reserveResourceCapacityMock).toHaveBeenCalledWith(3)
    );
    expect(importObsidianWorkspaceMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Upgrade to add more items");
  });

  it("blocks import on slug collision", async () => {
    const user = userEvent.setup();

    render(
      <ImportObsidianWorkspaceDialog
        onOpenChange={vi.fn()}
        open
        orgId="org_1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Slug")).toHaveProperty("value", "my-vault")
    );
    await user.clear(screen.getByLabelText("Slug"));
    await user.type(screen.getByLabelText("Slug"), "taken-workspace");

    await waitFor(() => {
      expect(
        screen.getByText("Slug already exists in this organization")
      ).toBeTruthy();
    });
    expect(screen.getByLabelText("Slug").getAttribute("aria-invalid")).toBe(
      "true"
    );
    const describedBy = screen
      .getByLabelText("Slug")
      .getAttribute("aria-describedby");
    expect(describedBy).toBe("workspace-import-slug-error");
    expect(
      document.getElementById(describedBy ?? "")?.getAttribute("role")
    ).toBe("alert");
    expect(
      (
        screen.getByRole("button", {
          name: "Import Workspace",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("shows an error when folder selection fails", async () => {
    const user = userEvent.setup();
    pickObsidianImportDirectoryMock.mockRejectedValue(new Error("no access"));

    render(
      <ImportObsidianWorkspaceDialog
        onOpenChange={vi.fn()}
        open
        orgId="org_1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Import failed");
    });
  });
});

describe("CreateWorkspaceDialog", () => {
  it("stores only blank-workspace default plugins on submit", async () => {
    const user = userEvent.setup();
    createWorkspaceMock.mockResolvedValue("workspace_1");

    render(<CreateWorkspaceDialog onOpenChange={vi.fn()} open orgId="org_1" />);

    await user.type(screen.getByLabelText("Name"), "Launch Plan");
    await waitFor(() => {
      expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe(
        "launch-plan"
      );
    });

    await user.click(screen.getByRole("button", { name: "Create Workspace" }));

    await waitFor(() => {
      expect(replaceWorkspaceExtensionsMock).toHaveBeenCalledWith({
        db: expect.anything(),
        enabledExtensionIds: [
          "lunaris.rich-text",
          "lunaris.kanban",
          "lunaris.file",
        ],
        knownExtensionIds: expect.any(Array),
        workspaceId: "workspace_1",
      });
      expect(installWorkspaceExtensionMock).toHaveBeenCalledWith(
        "lunaris.excalidraw",
        expect.objectContaining({ version: "0.0.1" }),
        expect.any(Object)
      );
      expect(createWorkspaceMock).toHaveBeenCalledWith({
        db: {},
        name: "Launch Plan",
        organizationId: "org_1",
        slug: "launch-plan",
        visibility: "shared",
      });
      expect(posthogCaptureMock).toHaveBeenCalledWith("workspace_created", {
        template: "blank",
        plugin_count: 3,
        visibility: "shared",
      });
    });
  });

  it("removes the template picker from the creation form", async () => {
    render(<CreateWorkspaceDialog onOpenChange={vi.fn()} open orgId="org_1" />);
    await act(async () => {});

    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Slug")).toBeTruthy();
    expect(screen.getByText("Visibility")).toBeTruthy();
    expect(screen.getByText("Start from a blank workspace")).toBeTruthy();
    expect(screen.queryByText("Template")).toBeNull();
    expect(screen.queryByText("Empty Workspace")).toBeNull();
  });

  it("creates a cloud-synced private workspace", async () => {
    const user = userEvent.setup();
    createWorkspaceMock.mockResolvedValue("workspace_private");

    render(<CreateWorkspaceDialog onOpenChange={vi.fn()} open orgId="org_1" />);

    await user.type(screen.getByLabelText("Name"), "Private Notes");
    await user.click(screen.getByText("Private"));
    await user.click(screen.getByRole("button", { name: "Create Workspace" }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org_1",
          visibility: "private",
        })
      );
    });
  });

  it("shows a collision error and disables submit for matching organization slugs", async () => {
    const user = userEvent.setup();

    render(<CreateWorkspaceDialog onOpenChange={vi.fn()} open orgId="org_1" />);

    await user.type(screen.getByLabelText("Name"), "Taken Workspace");

    await waitFor(() => {
      expect(
        screen.getByText("Slug already exists in this organization")
      ).toBeTruthy();
    });
    expect(screen.getByLabelText("Slug").getAttribute("aria-invalid")).toBe(
      "true"
    );
    const describedBy = screen
      .getByLabelText("Slug")
      .getAttribute("aria-describedby");
    expect(describedBy).toBe("workspace-slug-error");
    expect(
      document.getElementById(describedBy ?? "")?.getAttribute("role")
    ).toBe("alert");
    expect(
      (
        screen.getByRole("button", {
          name: "Create Workspace",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("allows the same slug in another organization", async () => {
    const user = userEvent.setup();

    render(<CreateWorkspaceDialog onOpenChange={vi.fn()} open orgId="org_2" />);

    await user.type(screen.getByLabelText("Name"), "Taken Workspace");

    await waitFor(() => {
      expect(
        screen.queryByText("Slug already exists in this organization")
      ).toBeNull();
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Create Workspace",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });

  it("keeps a manual slug when the name changes again", async () => {
    const user = userEvent.setup();

    render(<CreateWorkspaceDialog onOpenChange={vi.fn()} open orgId="org_1" />);

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const slugInput = screen.getByLabelText("Slug") as HTMLInputElement;

    await user.type(nameInput, "First Draft");
    await waitFor(() => {
      expect(slugInput.value).toBe("first-draft");
    });

    await user.clear(slugInput);
    await user.type(slugInput, "custom-slug");
    await user.clear(nameInput);
    await user.type(nameInput, "Second Draft");

    expect(slugInput.value).toBe("custom-slug");
  });
});
