/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupClearButton,
  InputGroupInput,
  InputGroupTextarea,
} from "./input-group";

afterEach(cleanup);

it.each([
  ["input", InputGroupInput],
  ["textarea", InputGroupTextarea],
] as const)(
  "returns focus to the %s after clearing with Enter",
  async (_, Field) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    function Form() {
      const [value, setValue] = useState("Draft");
      return (
        <form onSubmit={onSubmit}>
          <InputGroup>
            <input name="id" type="hidden" value="1" />
            <InputGroupAddon>Text</InputGroupAddon>
            <Field
              aria-label="Contents"
              onChange={(event) => setValue(event.target.value)}
              value={value}
            />
            {value && (
              <InputGroupClearButton
                aria-label="Clear text"
                onClear={() => setValue("")}
              />
            )}
          </InputGroup>
        </form>
      );
    }

    render(<Form />);
    const field = screen.getByRole("textbox", { name: "Contents" });
    await user.click(screen.getByText("Text"));
    expect(document.activeElement).toBe(field);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Clear text" })
    );
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Clear text" })).toBeNull();
    expect(document.activeElement).toBe(field);
    await user.keyboard("More");
    expect(screen.getByDisplayValue("More")).toBe(field);
    expect(onSubmit).not.toHaveBeenCalled();
  }
);
