/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchButton } from "./search-button";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: () => "Search" }),
}));

vi.mock("@repo/features/hotkeys", () => ({
  useHotkeyDisplay: () => "⌘K",
}));

vi.mock("../hooks/useSearchDialog", () => ({
  useSearchDialog: () => ({ open: vi.fn() }),
}));

describe("SearchButton", () => {
  it("shows the workspace name while preserving the search action label", () => {
    render(<SearchButton workspaceName="Workspace One" />);

    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton.className).toContain("w-[15.6rem]");
    expect(searchButton.className).toContain("max-w-full");
    expect(screen.getByText("Workspace One")).toBeTruthy();
    expect(screen.queryByText("Search")).toBeNull();
  });
});
