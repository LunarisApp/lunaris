import { act, renderHook } from "@testing-library/react";
import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceResourceCreation } from "./use-workspace-resource-creation";

const { createFolder, createResource, getErrorKey, showError } = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createResource: vi.fn(),
  getErrorKey: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

vi.mock("sonner", () => ({
  toast: { error: showError },
}));

vi.mock("@repo/features/entitlements", () => ({
  getResourceCapacityErrorMessageKey: getErrorKey,
}));

vi.mock("../store", () => ({
  useWorkspaceActions: () => ({ createFolder, createResource }),
}));

describe("useWorkspaceResourceCreation", () => {
  const resourceType = {
    resourceTypeId: "lunaris.rich-text",
  } as ResourceTypeDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    getErrorKey.mockImplementation(
      (_error: unknown, fallbackKey: string) => fallbackKey
    );
  });

  it("returns created items", async () => {
    const created = {
      documentId: "document-1",
      resourceId: "item-1",
      name: "Document",
    };
    createResource.mockResolvedValue(created);
    const { result } = renderHook(() => useWorkspaceResourceCreation());

    await expect(
      act(() => result.current.createResource("parent-1", resourceType))
    ).resolves.toBe(created);
    expect(createResource).toHaveBeenCalledWith("parent-1", resourceType);
  });

  it("reports item creation errors and returns null", async () => {
    const error = new Error("capacity reached");
    createResource.mockRejectedValue(error);
    const { result } = renderHook(() => useWorkspaceResourceCreation());

    await expect(
      act(() => result.current.createResource("parent-1", resourceType))
    ).resolves.toBeNull();
    expect(getErrorKey).toHaveBeenCalledWith(
      error,
      "explorer.failedToCreateResource"
    );
    expect(showError).toHaveBeenCalledWith(
      "translated:explorer.failedToCreateResource"
    );
  });

  it("reports folder creation errors and returns null", async () => {
    const error = new Error("capacity reached");
    createFolder.mockRejectedValue(error);
    const { result } = renderHook(() => useWorkspaceResourceCreation());

    await expect(
      act(() => result.current.createFolder("parent-1"))
    ).resolves.toBeNull();
    expect(getErrorKey).toHaveBeenCalledWith(
      error,
      "explorer.failedToCreateFolder"
    );
    expect(showError).toHaveBeenCalledWith(
      "translated:explorer.failedToCreateFolder"
    );
  });
});
