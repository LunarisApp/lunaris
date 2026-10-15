import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { WorkspaceTreeEmpty } from "./workspace-tree-empty";

describe("WorkspaceTreeEmpty", () => {
  it("renders localized title + description", () => {
    render(<WorkspaceTreeEmpty />);
    expect(screen.getByTestId("workspace-tree-empty")).toBeTruthy();
    expect(screen.getByText("explorer.emptyTitle")).toBeTruthy();
    expect(screen.getByText("explorer.emptyDescription")).toBeTruthy();
  });
});
