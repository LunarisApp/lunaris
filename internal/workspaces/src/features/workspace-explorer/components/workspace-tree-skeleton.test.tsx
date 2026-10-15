import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const useIsMobileMock = vi.fn(() => false);
vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => useIsMobileMock(),
}));

import { WorkspaceTreeSkeleton } from "./workspace-tree-skeleton";

describe("WorkspaceTreeSkeleton", () => {
  it("renders 8 skeleton rows with aria-busy + loading label", () => {
    render(<WorkspaceTreeSkeleton />);
    const list = screen.getByTestId("workspace-tree-skeleton");
    expect(list.getAttribute("aria-busy")).toBe("true");
    expect(list.getAttribute("aria-label")).toBe("explorer.loading");
    expect(list.children).toHaveLength(8);
  });

  it("uses desktop row metrics by default", () => {
    render(<WorkspaceTreeSkeleton />);
    const row = screen.getByTestId("workspace-tree-skeleton")
      .children[0] as HTMLElement;
    expect(row.className).toContain("h-13");
    expect(row.className).toContain("px-2");
    expect(row.className).toContain("py-1.5");
  });

  it("uses mobile row metrics on narrow viewport", () => {
    useIsMobileMock.mockReturnValueOnce(true);
    render(<WorkspaceTreeSkeleton />);
    const row = screen.getByTestId("workspace-tree-skeleton")
      .children[0] as HTMLElement;
    expect(row.className).toContain("h-16");
    expect(row.className).toContain("px-3");
    expect(row.className).toContain("py-2.5");
  });
});
