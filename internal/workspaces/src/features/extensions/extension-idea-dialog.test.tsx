import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiPost, capture, logError } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  capture: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@repo/features/api", () => ({
  useApi: () => ({ post: apiPost }),
}));

vi.mock("posthog-js", () => ({
  default: { capture },
}));

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: { ...actual.log, error: logError },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ExtensionIdeaDialog } from "./extension-idea-dialog";

beforeEach(() => {
  apiPost.mockReset();
  capture.mockReset();
  logError.mockReset();
});

afterEach(cleanup);

describe("ExtensionIdeaDialog", () => {
  it("submits a trimmed idea and resets after closing", async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({});
    render(<ExtensionIdeaDialog />);

    await user.click(
      screen.getByRole("button", {
        name: "extensions.interestTrigger",
      })
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", {
        name: "common.close",
      })
    ).toBeTruthy();
    const submit = within(dialog).getByRole("button", {
      name: "extensions.interestSubmit",
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.type(
      within(dialog).getByLabelText("extensions.interestIdeaLabel"),
      "  Keep backlinks when importing  "
    );
    await user.click(submit);

    expect(
      await within(dialog).findByText("extensions.interestSuccessTitle")
    ).toBeTruthy();
    expect(apiPost).toHaveBeenCalledWith("/v1/extension-requests", {
      body: { idea: "Keep backlinks when importing" },
    });
    expect(capture).toHaveBeenCalledWith("extension_idea_submitted");

    await user.click(
      within(dialog).getByRole("button", {
        name: "common.done",
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(
      screen.getByRole("button", {
        name: "extensions.interestTrigger",
      })
    );
    expect(
      (
        (await screen.findByLabelText(
          "extensions.interestIdeaLabel"
        )) as HTMLTextAreaElement
      ).value
    ).toBe("");
  });

  it("keeps the dialog open and reports submission failure", async () => {
    const user = userEvent.setup();
    const error = new Error("offline");
    apiPost.mockRejectedValue(error);
    render(<ExtensionIdeaDialog />);

    await user.click(
      screen.getByRole("button", {
        name: "extensions.interestTrigger",
      })
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("extensions.interestIdeaLabel"),
      "A citation manager"
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "extensions.interestSubmit",
      })
    );

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "extensions.interestError"
    );
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "extension idea submission failed",
        tag: "Extensions",
      })
    );
    expect(capture).toHaveBeenCalledWith("extension_idea_failed");
  });

  it("disables close controls while submitting", async () => {
    const user = userEvent.setup();
    let resolveRequest: (() => void) | undefined;
    apiPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve({});
        })
    );
    render(<ExtensionIdeaDialog />);

    await user.click(
      screen.getByRole("button", {
        name: "extensions.interestTrigger",
      })
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("extensions.interestIdeaLabel"),
      "A citation manager"
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "extensions.interestSubmit",
      })
    );

    expect(
      (
        within(dialog).getByRole("button", {
          name: "common.close",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "common.cancel",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    resolveRequest?.();
    expect(
      await within(dialog).findByText("extensions.interestSuccessTitle")
    ).toBeTruthy();
  });
});
