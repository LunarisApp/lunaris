/** @vitest-environment happy-dom */

import type { IconSvgObject } from "@lunarisapp/ui/icons";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@repo/features/permissions";
import { ExtensionsPanel } from "./ExtensionsPanel";
import { ExtensionRegistryProvider } from "./extension-registry-context";

const testIcon = [] as unknown as IconSvgObject;
const registry = {
  addedAt: "2026-01-01T00:00:00.000Z",
  addedBy: null,
  id: "lunaris-official",
  kind: "github" as const,
  location: "lunaris/extensions",
  manifestUrl: "https://extensions.example/marketplace.json",
  official: true,
  organizationId: "org_1",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const marketplace = {
  displayName: "Lunaris",
  enabled: true,
  extensions: [
    {
      description: "Draw diagrams",
      developer: "Lunaris",
      homepageUrl: "https://excalidraw.example",
      id: "lunaris.excalidraw",
      keywords: ["diagram", "whiteboard"],
      latestVersion: "0.0.1",
      name: "Excalidraw",
      repository: "https://github.com/lunaris/excalidraw",
      versions: [
        {
          api: "^0.9.0",
          descriptor: {
            bytes: 123,
            sha256: "a".repeat(64),
            url: "https://extensions.example/excalidraw.json",
          },
          runtime: { kind: "iframe" as const, protocol: 6 as const },
          status: "active" as const,
          version: "0.0.1",
        },
      ],
    },
  ],
  generatedAt: "2026-01-01T00:00:00.000Z",
  name: "lunaris",
  schemaVersion: 1 as const,
};

const {
  applyRuntimeChangeMock,
  installMock,
  liveCatalogMock,
  logErrorMock,
  marketplaceQueriesMock,
  registriesQueryMock,
  workspaceRowsMock,
  restoreMock,
  setEnabledMock,
  toastWarningMock,
  uninstallMock,
} = vi.hoisted(() => ({
  applyRuntimeChangeMock: vi.fn(),
  installMock: vi.fn(),
  liveCatalogMock: vi.fn(),
  logErrorMock: vi.fn(),
  marketplaceQueriesMock: vi.fn(),
  registriesQueryMock: vi.fn(),
  workspaceRowsMock: vi.fn(),
  restoreMock: vi.fn(),
  setEnabledMock: vi.fn(),
  toastWarningMock: vi.fn(),
  uninstallMock: vi.fn(),
}));

vi.mock("evlog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("evlog")>()),
  log: { error: logErrorMock, warn: vi.fn() },
}));

vi.mock("@repo/data/core", () => ({ usePowerSync: () => ({}) }));

vi.mock("@repo/data/features/workspace-extensions", () => ({
  createWorkspaceExtensionsService: () => ({
    install: installMock,
    restore: restoreMock,
    setEnabled: setEnabledMock,
    uninstall: uninstallMock,
  }),
  toWorkspaceExtensionInstallation: (row: Record<string, unknown>) =>
    row.registry_id && row.version
      ? {
          descriptorBytes: row.descriptor_bytes ?? null,
          descriptorSha256: row.descriptor_sha256 ?? null,
          descriptorUrl: row.descriptor_url ?? null,
          enabled: Boolean(row.enabled),
          extensionId: row.extension_id,
          registryId: row.registry_id,
          version: row.version,
        }
      : null,
  useWorkspaceExtensionsQuery: () => workspaceRowsMock(),
}));

vi.mock("@repo/data/features/organization-extension-registries", () => ({
  useOrganizationExtensionRegistriesQuery: () => registriesQueryMock(),
}));

vi.mock("@repo/platform", () => ({
  useOnlineStatus: () => true,
  usePlatform: () => ({
    navigation: { reload: vi.fn() },
    plugins: {},
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueries: (options: unknown) => marketplaceQueriesMock(options),
}));

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: toastWarningMock },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));
vi.mock("../workspace", () => ({
  useCurrentWorkspace: () => ({
    workspace: { organization_id: "org_1" },
    workspaceId: "workspace_1",
  }),
}));
vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ unregisterPlugin: vi.fn() }),
}));
vi.mock("./extension-idea-dialog", () => ({
  ExtensionIdeaDialog: () => <button type="button">suggest-extension</button>,
}));
vi.mock("./workspace-extension-change-notification", () => ({
  notifyWorkspaceExtensionsChanged: vi.fn(),
}));
vi.mock("./marketplace-queries", () => ({
  extensionMarketplaceQueryOptions: () => ({ queryFn: liveCatalogMock }),
}));

function renderPanel(children?: (panel: ReactNode) => ReactNode) {
  const panel = (
    <ExtensionRegistryProvider
      allExtensionIds={[
        "lunaris.rich-text",
        "lunaris.sheet",
        "lunaris.excalidraw",
      ]}
      applyRuntimeChange={applyRuntimeChangeMock}
      bundledExtensionIds={["lunaris.rich-text", "lunaris.sheet"]}
      defaultExtensionIds={["lunaris.rich-text"]}
      extensionMetadata={{
        "lunaris.rich-text": {
          description: "Rich text",
          developer: "Lunaris",
          icon: testIcon,
          id: "lunaris.rich-text",
          keywords: ["editor", "writing"],
          longDescription: "Write and format rich text documents.",
          name: "Rich Text",
          version: "1.0.0",
          website: "https://lunaris.app/extensions/rich-text",
        },
        "lunaris.sheet": {
          description: "Sheet",
          developer: "Lunaris",
          icon: testIcon,
          id: "lunaris.sheet",
          name: "Sheet",
          version: "1.0.0",
        },
      }}
    >
      <ExtensionsPanel />
    </ExtensionRegistryProvider>
  );
  return render(children ? children(panel) : panel);
}

describe("ExtensionsPanel", () => {
  beforeEach(() => {
    registriesQueryMock.mockReturnValue({ data: [registry], isLoading: false });
    vi.clearAllMocks();
    installMock.mockResolvedValue(undefined);
    applyRuntimeChangeMock.mockResolvedValue(undefined);
    restoreMock.mockResolvedValue(undefined);
    setEnabledMock.mockResolvedValue(undefined);
    uninstallMock.mockResolvedValue(undefined);
    liveCatalogMock.mockResolvedValue({
      catalog: marketplace,
      source: "network",
    });
    workspaceRowsMock.mockReturnValue({
      data: [{ enabled: 1, extension_id: "lunaris.rich-text" }],
    });
    marketplaceQueriesMock.mockReturnValue([
      {
        data: { catalog: marketplace, source: "network" },
      },
    ]);
  });

  it("does not query a fallback marketplace while directory sync is pending", () => {
    registriesQueryMock.mockReturnValue({ data: [], isLoading: true });
    marketplaceQueriesMock.mockReturnValue([]);
    renderPanel();
    expect(marketplaceQueriesMock).toHaveBeenLastCalledWith({ queries: [] });
    expect(screen.getByText("Rich Text")).toBeTruthy();
  });

  it("uses the default marketplace after an empty directory finishes syncing", () => {
    registriesQueryMock.mockReturnValue({ data: [], isLoading: false });
    marketplaceQueriesMock.mockReturnValue([]);
    renderPanel();
    expect(marketplaceQueriesMock).toHaveBeenLastCalledWith({
      queries: [expect.any(Object)],
    });
  });

  it("mixes bundled and marketplace extensions without registry UI", () => {
    renderPanel();

    expect(screen.getByText("Rich Text")).toBeTruthy();
    expect(screen.getByText("Excalidraw")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "organization.extensions.install" })
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("lunaris/extensions");
    expect(document.body.textContent).not.toContain("marketplace.json");
    expect(screen.queryByText("diagram")).toBeNull();
    expect(screen.queryByText("whiteboard")).toBeNull();
  });

  it("uses generated WebPs for bundled extension icons", () => {
    renderPanel();

    const builtinCard = screen
      .getByText("Rich Text")
      .closest('[data-slot="card"]');
    const externalCard = screen
      .getByText("Excalidraw")
      .closest('[data-slot="card"]');
    const builtinIcon = builtinCard?.querySelector<HTMLImageElement>("img");
    const externalIcon = externalCard?.querySelector<HTMLImageElement>("img");

    expect(builtinIcon?.src).toMatch(/\/assets\/builtin-rich-text\.webp$/);
    expect(builtinIcon?.className).toContain("rounded-lg");
    expect(externalIcon).toBeNull();
  });

  it("zooms and de-zooms bundled extension screenshots on click", async () => {
    renderPanel();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "organization.extensions.viewDetailsFor",
      })[0]!
    );

    const name = "Rich text document with formatting menu open in Lunaris";
    const zoomTrigger = await screen.findByRole("button", { name });
    const screenshot = within(zoomTrigger).getByRole("img", { name });
    expect(screenshot.getAttribute("src")).toMatch(/\/assets\/rich-text\.png$/);

    fireEvent.click(zoomTrigger);

    const zoomDialog = await screen.findByRole("dialog", { name });
    expect(zoomDialog.className).toContain("data-open:zoom-in-85");
    expect(zoomDialog.className).toContain("data-open:duration-350");
    expect(zoomDialog.className).toContain("data-closed:zoom-out-85");
    expect(zoomDialog.className).toContain("data-closed:duration-300");
    expect(zoomDialog.className).toContain("motion-reduce:animate-none");
    expect(
      within(zoomDialog).queryByRole("button", { name: "Close" })
    ).toBeNull();
    const zoomOutTrigger = within(zoomDialog).getByRole("button", { name });
    expect(within(zoomOutTrigger).getByRole("img", { name })).toBeTruthy();

    fireEvent.click(zoomOutTrigger);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name })).toBeNull()
    );
  });

  it("persists bundled toggles for workspace writers", async () => {
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "extensions.enableExtension" })
    );

    await waitFor(() =>
      expect(setEnabledMock).toHaveBeenCalledWith(
        "lunaris.sheet",
        true,
        expect.objectContaining({
          defaultExtensionIds: ["lunaris.rich-text"],
        })
      )
    );
  });

  it("warns without restoring a disabled extension after cleanup fails", async () => {
    applyRuntimeChangeMock.mockRejectedValueOnce(new Error("cleanup failed"));
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "extensions.disableExtension" })
    );

    await waitFor(() => expect(toastWarningMock).toHaveBeenCalledOnce());
    expect(setEnabledMock).toHaveBeenCalledWith(
      "lunaris.rich-text",
      false,
      expect.any(Object)
    );
    expect(setEnabledMock).toHaveBeenCalledOnce();
  });

  it("keeps only built-in metadata on cards and moves dialog metadata to its action", async () => {
    renderPanel();

    expect(screen.getAllByText("extensions.builtIn")).toHaveLength(2);
    expect(screen.queryByText("extensions.enabled")).toBeNull();
    expect(screen.queryByText("extensions.available")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "extensions.enableExtension",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "extensions.disableExtension",
      })
    ).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "organization.extensions.viewDetailsFor",
      })[0]!
    );

    const dialog = await screen.findByRole("dialog");
    const header = dialog.querySelector('[data-slot="dialog-header"]');
    const footer = dialog.querySelector('[data-slot="dialog-footer"]');
    expect(header).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(
      within(header as HTMLElement).queryByText("extensions.builtIn")
    ).toBeNull();
    expect(
      within(header as HTMLElement).queryByText("extensions.enabled")
    ).toBeNull();
    expect(
      within(footer as HTMLElement).getByText("extensions.builtIn")
    ).toBeTruthy();
    expect(
      within(footer as HTMLElement).getByRole("button", {
        name: "extensions.disableExtension",
      })
    ).toBeTruthy();
    expect(screen.getAllByText("extensions.builtIn")).toHaveLength(3);
  });

  it("uses short and long manifest descriptions without repeating author", async () => {
    renderPanel();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "organization.extensions.viewDetailsFor",
      })[0]!
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Rich text")).toBeTruthy();
    expect(
      within(dialog).getByText("Write and format rich text documents.")
    ).toBeTruthy();
    expect(within(dialog).getAllByText("Lunaris")).toHaveLength(1);
  });

  it("shows extension metadata in sidebar without API constraint", async () => {
    renderPanel();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "organization.extensions.viewDetailsFor",
      })[0]!
    );

    const dialog = await screen.findByRole("dialog");
    const sidebar = dialog.querySelector("aside");
    expect(sidebar).not.toBeNull();
    const details = within(sidebar as HTMLElement);
    expect(details.getByText("organization.extensions.pluginId")).toBeTruthy();
    expect(details.getByText("lunaris.rich-text")).toBeTruthy();
    expect(details.getByText("editor")).toBeTruthy();
    expect(details.getByText("writing")).toBeTruthy();
    const detailLabels = Array.from(
      (sidebar as HTMLElement).querySelectorAll("dt"),
      (label) => label.textContent
    );
    expect(detailLabels.at(-1)).toBe("organization.extensions.pluginId");
    expect(
      details.getByRole("link", { name: /lunaris\.app/ }).getAttribute("href")
    ).toBe("https://lunaris.app/extensions/rich-text");
    expect(details.queryByText("organization.extensions.api")).toBeNull();
  });

  it("finds extensions by keyword", () => {
    renderPanel();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "organization.extensions.search",
      }),
      { target: { value: "whiteboard" } }
    );

    expect(screen.getByText("Excalidraw")).toBeTruthy();
    expect(screen.queryByText("Rich Text")).toBeNull();
  });

  it("disables extension changes without content write access", () => {
    renderPanel((panel) => (
      <PermissionProvider check={() => false}>{panel}</PermissionProvider>
    ));

    expect(
      (
        screen.getByRole("button", {
          name: "extensions.enableExtension",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "organization.extensions.install",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("does not install from a cached marketplace", () => {
    marketplaceQueriesMock.mockReturnValue([
      {
        data: { catalog: marketplace, source: "cache" },
      },
    ]);
    renderPanel();

    expect(
      (
        screen.getByRole("button", {
          name: "organization.extensions.install",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("confirms trust before installing a pinned marketplace release", async () => {
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "organization.extensions.install" })
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "organization.extensions.confirmInstall",
      })
    );

    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith(
        "lunaris.excalidraw",
        {
          descriptor: marketplace.extensions[0]!.versions[0]!.descriptor,
          registryId: "lunaris-official",
          version: "0.0.1",
        },
        expect.any(Object)
      )
    );
  });

  it("revalidates release status before installing", async () => {
    liveCatalogMock.mockResolvedValue({
      catalog: {
        ...marketplace,
        extensions: [
          {
            ...marketplace.extensions[0]!,
            versions: [
              {
                ...marketplace.extensions[0]!.versions[0]!,
                status: "blocked",
              },
            ],
          },
        ],
      },
      source: "network",
    });
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "organization.extensions.install" })
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "organization.extensions.confirmInstall",
      })
    );

    await waitFor(() => expect(logErrorMock).toHaveBeenCalled());
    expect(installMock).not.toHaveBeenCalled();
  });

  it("keeps a failed new install pinned but disabled", async () => {
    applyRuntimeChangeMock.mockRejectedValueOnce(
      new Error("activation failed")
    );
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "organization.extensions.install" })
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "organization.extensions.confirmInstall",
      })
    );

    await waitFor(() =>
      expect(setEnabledMock).toHaveBeenCalledWith(
        "lunaris.excalidraw",
        false,
        expect.any(Object)
      )
    );
    expect(uninstallMock).not.toHaveBeenCalled();
  });

  it("restores the exact prior release after an upgrade fails", async () => {
    const nextRelease = {
      ...marketplace.extensions[0]!.versions[0]!,
      descriptor: {
        ...marketplace.extensions[0]!.versions[0]!.descriptor,
        sha256: "b".repeat(64),
      },
      version: "0.0.2",
    };
    const upgradeMarketplace = {
      ...marketplace,
      extensions: [
        {
          ...marketplace.extensions[0]!,
          latestVersion: "0.0.2",
          versions: [nextRelease, marketplace.extensions[0]!.versions[0]!],
        },
      ],
    };
    const previous = {
      descriptorBytes: 123,
      descriptorSha256: "a".repeat(64),
      descriptorUrl: "https://extensions.example/excalidraw.json",
      enabled: true,
      extensionId: "lunaris.excalidraw",
      registryId: "lunaris-official",
      version: "0.0.1",
    };
    workspaceRowsMock.mockReturnValue({
      data: [
        {
          descriptor_bytes: previous.descriptorBytes,
          descriptor_sha256: previous.descriptorSha256,
          descriptor_url: previous.descriptorUrl,
          enabled: 1,
          extension_id: previous.extensionId,
          registry_id: previous.registryId,
          version: previous.version,
        },
      ],
    });
    marketplaceQueriesMock.mockReturnValue([
      {
        data: { catalog: upgradeMarketplace, source: "network" },
      },
    ]);
    liveCatalogMock.mockResolvedValue({
      catalog: upgradeMarketplace,
      source: "network",
    });
    applyRuntimeChangeMock.mockRejectedValueOnce(new Error("upgrade failed"));
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "organization.extensions.update" })
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "organization.extensions.confirmInstall",
      })
    );

    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith(previous));
  });

  it("uninstalls from cards and warns without reinstalling after cleanup fails", async () => {
    workspaceRowsMock.mockReturnValue({
      data: [
        {
          descriptor_bytes: 123,
          descriptor_sha256: "a".repeat(64),
          descriptor_url: "https://extensions.example/excalidraw.json",
          enabled: 1,
          extension_id: "lunaris.excalidraw",
          registry_id: "lunaris-official",
          version: "0.0.1",
        },
      ],
    });
    applyRuntimeChangeMock.mockRejectedValueOnce(new Error("cleanup failed"));
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", {
        name: "organization.extensions.uninstall",
      })
    );

    await waitFor(() => expect(toastWarningMock).toHaveBeenCalledOnce());
    expect(uninstallMock).toHaveBeenCalledWith("lunaris.excalidraw");
    expect(installMock).not.toHaveBeenCalled();
  });
});
