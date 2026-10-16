/** @vitest-environment happy-dom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth";
import { readPendingOrganization } from "../pending-organization";
import { CreateOrganizationDialog } from "./create-organization-dialog";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) =>
      path.includes("?") ? `${path}&region=us` : `${path}?region=us`,
  }),
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@lunarisapp/ui/components/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@lunarisapp/ui/components/field", () => ({
  Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FieldError: ({
    errors,
  }: {
    errors?: Array<{ message?: string } | undefined>;
  }) => {
    const message = errors?.find((error) => error?.message)?.message;
    return message ? <div role="alert">{message}</div> : null;
  },
  FieldLabel: ({
    children,
    htmlFor,
  }: {
    children: ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@lunarisapp/ui/components/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "common.cancel": "Cancel",
          "common.error": "Something went wrong",
          "organization.createOrganization": "Create organization",
          "organization.createOrganizationPlaceholder": "Organization name",
          "organization.created": "Organization created",
          "organization.name": "Name",
          "organization.slug": "Slug",
          "organization.slugHint": "Lowercase letters, numbers, and hyphens",
          "organization.slugInvalid": "Invalid slug",
          "organization.slugRequired": "Slug is required",
          "organization.slugTaken":
            "Slug already exists in another organization",
        }) as const
      )[
        key as
          | "common.cancel"
          | "common.error"
          | "organization.createOrganization"
          | "organization.createOrganizationPlaceholder"
          | "organization.created"
          | "organization.name"
          | "organization.slug"
          | "organization.slugHint"
          | "organization.slugInvalid"
          | "organization.slugRequired"
          | "organization.slugTaken"
      ] ?? key,
  }),
}));

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

function renderDialog({
  checkSlug = vi
    .fn()
    .mockResolvedValue({ data: { status: true }, error: null }),
  create = vi.fn().mockResolvedValue({
    data: { id: "org_2", slug: "alpha-space" },
    error: null,
  }),
  setActive = vi.fn().mockResolvedValue({ data: null, error: null }),
} = {}) {
  render(
    <MemoryRouter initialEntries={["/workspaces?region=us"]}>
      <AuthProvider
        client={
          {
            organization: { checkSlug, create, setActive },
          } as never
        }
      >
        <CreateOrganizationDialog onOpenChange={vi.fn()} open />
        <LocationDisplay />
      </AuthProvider>
    </MemoryRouter>
  );

  return { checkSlug, create, setActive };
}

describe("CreateOrganizationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/workspaces?region=us");
  });

  it("creates an organization and opens its homepage", async () => {
    const user = userEvent.setup();
    const { checkSlug, create, setActive } = renderDialog();

    await user.type(screen.getByLabelText("Name"), "Alpha Space");
    await user.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    await waitFor(() => {
      expect(checkSlug).toHaveBeenCalledWith({ slug: "alpha-space" });
      expect(create).toHaveBeenCalledWith({
        keepCurrentActiveOrganization: true,
        name: "Alpha Space",
        slug: "alpha-space",
      });
      expect(setActive).not.toHaveBeenCalled();
      expect(screen.getByTestId("location").textContent).toBe(
        "/alpha-space?region=us"
      );
      expect(readPendingOrganization()).toEqual({
        id: "org_2",
        name: "Alpha Space",
        slug: "alpha-space",
      });
    });
  });

  it("shows duplicate slug error when slug is taken", async () => {
    const user = userEvent.setup();
    const { create } = renderDialog({
      checkSlug: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "taken" },
      }),
    });

    await user.type(screen.getByLabelText("Name"), "Taken Organization");
    await user.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    await waitFor(() => {
      expect(
        screen.getByText("Slug already exists in another organization")
      ).toBeTruthy();
    });
    expect(create).not.toHaveBeenCalled();
  });
});
