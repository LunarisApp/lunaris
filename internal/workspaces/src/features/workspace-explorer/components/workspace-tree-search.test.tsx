import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

import { WorkspaceTreeSearch } from "./workspace-tree-search";

describe("WorkspaceTreeSearch", () => {
  it("hides clear button when value empty", () => {
    render(<WorkspaceTreeSearch onChange={() => {}} value="" />);
    expect(screen.queryByLabelText("explorer.clearSearch")).toBeNull();
  });

  it("shows clear button when value non-empty", () => {
    render(<WorkspaceTreeSearch onChange={() => {}} value="q" />);
    expect(screen.getByLabelText("explorer.clearSearch")).toBeTruthy();
  });

  it("clear button fires onChange('')", () => {
    const onChange = vi.fn();
    render(<WorkspaceTreeSearch onChange={onChange} value="q" />);
    fireEvent.click(screen.getByLabelText("explorer.clearSearch"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("propagates typed value via onChange", () => {
    const onChange = vi.fn();
    render(<WorkspaceTreeSearch onChange={onChange} value="" />);
    fireEvent.change(screen.getByLabelText("explorer.searchPlaceholder"), {
      target: { value: "foo" },
    });
    expect(onChange).toHaveBeenCalledWith("foo");
  });

  it("forwards onKeyDown from input", () => {
    const onKeyDown = vi.fn();
    render(
      <WorkspaceTreeSearch onChange={() => {}} onKeyDown={onKeyDown} value="" />
    );
    fireEvent.keyDown(screen.getByLabelText("explorer.searchPlaceholder"), {
      key: "ArrowDown",
    });
    expect(onKeyDown).toHaveBeenCalled();
  });

  it("sets combobox role + aria plumbing when provided", () => {
    render(
      <WorkspaceTreeSearch
        activeDescendantId="listbox-option-2"
        controlsId="listbox-1"
        onChange={() => {}}
        value="q"
      />
    );
    const input = screen.getByLabelText("explorer.searchPlaceholder");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-controls")).toBe("listbox-1");
    expect(input.getAttribute("aria-haspopup")).toBe("listbox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      "listbox-option-2"
    );
  });

  it("omits aria-activedescendant when none provided", () => {
    render(<WorkspaceTreeSearch onChange={() => {}} value="" />);
    const input = screen.getByLabelText("explorer.searchPlaceholder");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});
