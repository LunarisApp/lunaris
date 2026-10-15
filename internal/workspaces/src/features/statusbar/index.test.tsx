import { render, screen } from "@testing-library/react";
import type { ResourceViewStatusProps } from "@lunarisapp/plugin-sdk";
import { type ReactNode, useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridLayoutProvider, useGridLayoutStore } from "../grid-layout";
import { ActiveResourceStatusBar } from "./index";

type TestResource = {
  currentVersion?: number;
  storageKind?: "file" | "yjs";
};

let slotKind: "file" | "yjs" = "yjs";

const resources = new Map<string, TestResource>();
const views = new Map<
  string,
  {
    statusBar?: (context: ResourceViewStatusProps) => ReactNode;
    storageRequirements?: Record<string, "file" | "yjs">;
  }
>();

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceType: (id: string) => resources.has(id) ? ({
    resourceTypeId: id,
    schema: {
      currentVersion: resources.get(id)?.currentVersion ?? 1,
      id: `${id}.schema`,
    },
    storage: resources.get(id)?.storageKind
      ? { content: { kind: resources.get(id)!.storageKind! } }
      : {},
  }) : undefined,
  useView: (id: string) => {
    const view = views.get(id);
    return view
      ? { definition: { ...view, target: { kind: "resource" } } }
      : undefined;
  },
}));

vi.mock(
  "@repo/data/features/workspace-storage-slots",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@repo/data/features/workspace-storage-slots")
    >()),
    useResourceStorageSlots: () => ({
      data: [{ id: "storage-1", kind: slotKind, name: "content" }],
    }),
  }),
);

function GridSetup({
  resourceId = "item-1",
  parentId,
  pluginId,
  schemaVersion = 1,
  viewId,
}: {
  resourceId?: string;
  parentId?: string | null;
  pluginId: string;
  schemaVersion?: number;
  viewId?: string;
}) {
  const markPanelActive = useGridLayoutStore((state) => state.markPanelActive);
  const openResourcePanel = useGridLayoutStore((state) => state.openResourcePanel);
  const activePanelId = useGridLayoutStore((state) => state.activePanelId);
  const panels = useGridLayoutStore((state) => state.panels);

  useEffect(() => {
    openResourcePanel({
      parentId,
      resourceId: resourceId,
      extensionId: pluginId,
      resourceTypeId: pluginId,
      viewId: viewId ?? pluginId,
      schemaVersion,
      title: "Document",
    });
  }, [
    resourceId,
    openResourcePanel,
    parentId,
    pluginId,
    schemaVersion,
    viewId,
  ]);

  useEffect(() => {
    const panel = panels.find((entry) => entry.params?.resourceId === resourceId);
    if (panel && activePanelId !== panel.id) {
      markPanelActive(panel.id);
    }
  }, [activePanelId, resourceId, markPanelActive, panels]);

  return null;
}

function renderStatusbar(setup?: ReactNode) {
  return render(
    <GridLayoutProvider>
      {setup}
      <ActiveResourceStatusBar />
    </GridLayoutProvider>
  );
}

function HookUsingStatusBar() {
  const [label] = useState("12 elements");
  return <span>{label}</span>;
}

describe("ActiveResourceStatusBar", () => {
  beforeEach(() => {
    resources.clear();
    views.clear();
    slotKind = "yjs";
  });

  it("renders nothing without an active item panel", () => {
    renderStatusbar();

    expect(screen.queryByText("1,248 words")).toBeNull();
  });

  it("renders rich text statusbar content for active rich text item", async () => {
    resources.set("lunaris.rich-text", { storageKind: "yjs" });
    views.set("lunaris.rich-text", {
      statusBar: () => (
        <>
          <span>1,248 words</span>
          <span>6,903 chars</span>
        </>
      ),
    });

    renderStatusbar(<GridSetup pluginId="lunaris.rich-text" />);

    expect(await screen.findByText("1,248 words")).toBeTruthy();
    expect(screen.getByText("6,903 chars")).toBeTruthy();
  });

  it("switches output when the active resource type changes", async () => {
    resources.set("lunaris.excalidraw", {});
    views.set("lunaris.excalidraw", {
      statusBar: HookUsingStatusBar,
    });

    renderStatusbar(<GridSetup pluginId="lunaris.excalidraw" />);

    expect(await screen.findByText("12 elements")).toBeTruthy();
    expect(screen.queryByText("1,248 words")).toBeNull();
  });

  it("renders nothing when a view has no status bar", () => {
    resources.set("lunaris.file", {});
    views.set("lunaris.file", {});

    renderStatusbar(<GridSetup pluginId="lunaris.file" />);

    expect(screen.queryByText("12 elements")).toBeNull();
    expect(screen.queryByText("1,248 words")).toBeNull();
  });

  it("uses only the active view's status bar", async () => {
    resources.set("acme.note", {});
    views.set("acme.note.editor", {
      statusBar: () => <span>Editor status</span>,
    });
    views.set("acme.note.preview", {
      statusBar: () => <span>Preview status</span>,
    });

    renderStatusbar(
      <GridSetup pluginId="acme.note" viewId="acme.note.preview" />,
    );

    expect(await screen.findByText("Preview status")).toBeTruthy();
    expect(screen.queryByText("Editor status")).toBeNull();
  });

  it("passes normalized panel resource context to the active view", async () => {
    let received: ResourceViewStatusProps | undefined;
    resources.set("acme.file", { currentVersion: 3, storageKind: "file" });
    slotKind = "file";
    views.set("acme.file", {
      storageRequirements: { content: "file" },
      statusBar: (context) => {
        received = context;
        return <span>File status</span>;
      },
    });

    renderStatusbar(
      <GridSetup
        parentId="folder-1"
        pluginId="acme.file"
        schemaVersion={0}
      />,
    );

    expect(await screen.findByText("File status")).toBeTruthy();
    expect(received).toMatchObject({
      resource: {
        parentId: "folder-1",
        resourceId: "item-1",
        schemaVersion: 3,
      },
      storage: { content: { kind: "file", storageId: "storage-1" } },
    });
  });
});
