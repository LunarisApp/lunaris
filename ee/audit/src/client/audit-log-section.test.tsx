/** @vitest-environment happy-dom */

import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEventListItem } from "./queries";
import { AuditLogSection } from "./audit-log-section";

const { apiGet, network } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  network: { online: true },
}));

vi.mock("@repo/features/api", () => ({
  useApi: () => ({ get: apiGet }),
}));

vi.mock("@repo/platform", () => ({
  useOnlineStatus: () => network.online,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

const auditEvent: AuditEventListItem = {
  action: "workspace.updated",
  actorId: "user_1",
  actorType: "user",
  changedFields: ["name"],
  id: "audit_1",
  occurredAt: "2026-08-11T10:00:00.000Z",
  outcome: "success",
  reason: "Workspace renamed",
  requestId: "request_1",
  targetId: "workspace_1",
  targetType: "workspace",
  traceId: "trace_1",
};

function renderSection(active = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogSection active={active} organizationId="organization_1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue({ items: [], nextCursor: null });
  network.online = true;
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("AuditLogSection", () => {
  it("uses second-level headings below the page title", () => {
    renderSection(false);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "organization.audit.filters",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "organization.audit.activity",
      }),
    ).toBeTruthy();
  });

  it("does not request events before the tab becomes active", async () => {
    apiGet.mockResolvedValue({ items: [], nextCursor: null });

    renderSection(false);

    await Promise.resolve();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("renders curated event details without raw audit context", async () => {
    apiGet.mockResolvedValue({ items: [auditEvent], nextCursor: null });
    renderSection();

    expect(await screen.findByText("workspace.updated")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByText("organization.audit.view"));

    expect(await screen.findByText("Workspace renamed")).toBeTruthy();
    expect(screen.getByText("request_1")).toBeTruthy();
    expect(screen.getByText("trace_1")).toBeTruthy();
    expect(screen.queryByText("private-user-agent")).toBeNull();
  });

  it("applies exact filters and resets cursor pagination", async () => {
    apiGet.mockResolvedValue({ items: [], nextCursor: null });
    renderSection();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("organization.audit.action"),
      "workspace.updated",
    );
    await user.type(
      screen.getByLabelText("organization.audit.actorId"),
      "user_1",
    );
    await user.selectOptions(
      screen.getByLabelText("organization.audit.outcome"),
      "denied",
    );
    await user.click(screen.getByText("organization.audit.applyFilters"));

    await waitFor(() =>
      expect(apiGet).toHaveBeenLastCalledWith("/v1/audit-events", {
        params: {
          action: "workspace.updated",
          actorId: "user_1",
          cursor: undefined,
          from: undefined,
          limit: 50,
          outcome: "denied",
          to: undefined,
        },
      }),
    );
  });

  it("serializes inclusive local date filters as ISO timestamps", async () => {
    renderSection();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));

    const dateInputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    fireEvent.change(dateInputs[0]!, {
      target: { value: "2026-08-11T10:00" },
    });
    fireEvent.change(dateInputs[1]!, {
      target: { value: "2026-08-11T12:30" },
    });
    await userEvent.click(screen.getByText("organization.audit.applyFilters"));

    await waitFor(() =>
      expect(apiGet).toHaveBeenLastCalledWith("/v1/audit-events", {
        params: expect.objectContaining({
          from: new Date("2026-08-11T10:00").toISOString(),
          to: new Date("2026-08-11T12:30").toISOString(),
        }),
      }),
    );
  });

  it("loads another cursor page and Clear returns to the first page", async () => {
    const secondEvent = {
      ...auditEvent,
      action: "workspace.created",
      id: "audit_2",
    };
    apiGet.mockImplementation((_path, options) =>
      Promise.resolve(
        options.params.cursor
          ? { items: [secondEvent], nextCursor: null }
          : { items: [auditEvent], nextCursor: "cursor_2" },
      )
    );
    renderSection();
    expect(await screen.findByText("workspace.updated")).toBeTruthy();

    await userEvent.click(screen.getByText("organization.audit.loadMore"));
    expect(await screen.findByText("workspace.created")).toBeTruthy();
    expect(apiGet).toHaveBeenLastCalledWith("/v1/audit-events", {
      params: expect.objectContaining({ cursor: "cursor_2" }),
    });

    await userEvent.click(screen.getByText("organization.audit.clearFilters"));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(3));
    expect(apiGet).toHaveBeenLastCalledWith("/v1/audit-events", {
      params: expect.objectContaining({ cursor: undefined }),
    });
    await waitFor(() =>
      expect(screen.queryByText("workspace.created")).toBeNull()
    );
  });

  it("shows empty, error, and retry states", async () => {
    apiGet.mockRejectedValueOnce(new Error("network failed"));
    renderSection();

    expect(await screen.findByText("organization.audit.loadFailed")).toBeTruthy();
    await userEvent.click(screen.getByText("common.retry"));

    expect(await screen.findByText("organization.audit.empty")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("blocks invalid date ranges before sending another request", async () => {
    apiGet.mockResolvedValue({ items: [], nextCursor: null });
    renderSection();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    const dateInputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    await user.type(dateInputs[0]!, "2026-08-11T12:00");
    await user.type(dateInputs[1]!, "2026-08-11T11:00");
    await user.click(screen.getByText("organization.audit.applyFilters"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "organization.audit.invalidRange",
    );
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("shows offline state without requesting audit events", async () => {
    network.online = false;
    onlineManager.setOnline(false);
    renderSection();

    expect(
      await screen.findByText("organization.audit.offlineTitle"),
    ).toBeTruthy();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
