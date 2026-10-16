/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtensionPlaceholder } from "./ExtensionPlaceholder";
import { ExtensionRegistryProvider } from "./extension-registry-context";

vi.mock("@repo/data/core", () => ({ usePowerSync: () => ({}) }));
vi.mock("@repo/features/permissions", () => ({ usePermission: () => true }));
vi.mock("../workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace-1" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; name?: string }) => {
      const value = options?.defaultValue ?? key;
      return options?.name ? `${value}:${options.name}` : value;
    },
  }),
}));

function renderPlaceholder(
  enabledExtensionIds: readonly string[],
  availability: "available" | "load-failure" = "available"
) {
  return render(
    <ExtensionRegistryProvider
      allExtensionIds={["test.extension"]}
      enabledExtensionIds={enabledExtensionIds}
      extensionAvailability={{ "test.extension": availability }}
      extensionMetadata={{
        "test.extension": {
          description: "Test extension",
          developer: "Test",
          icon: [],
          id: "test.extension",
          name: "Test Extension",
          version: "1.0.0",
        },
      }}
    >
      <ExtensionPlaceholder extensionId="test.extension" />
    </ExtensionRegistryProvider>
  );
}

describe("ExtensionPlaceholder", () => {
  it("shows loading state for an enabled extension awaiting its renderer", () => {
    renderPlaceholder(["test.extension"]);

    expect(
      screen.getByRole("status", {
        name: "extensions.loadingExtension:Test Extension",
      })
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the enable action for a disabled extension", () => {
    renderPlaceholder([]);

    expect(
      screen.getByRole("button", { name: "extensions.enableExtension" })
    ).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an error icon instead of a spinner after loading fails", () => {
    const { container } = renderPlaceholder(["test.extension"], "load-failure");

    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByText("extensions.placeholder.load-failure:Test Extension")
    ).toBeTruthy();
    expect(container.querySelector(".text-destructive")).toBeTruthy();
  });
});
