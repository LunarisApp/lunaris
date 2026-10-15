import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGet, apiPost, capture, toastSuccess } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  capture: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@repo/features/api", () => ({
  useApi: () => ({ get: apiGet, post: apiPost }),
}));

vi.mock("posthog-js", () => ({ default: { capture } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: toastSuccess },
}));

import { BackupsSection, type OrganizationBackup } from "./backups-section";

function makeBackup(overrides: Partial<OrganizationBackup> = {}): OrganizationBackup {
  return {
    archiveSizeBytes: null,
    completedAt: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    expiresAt: null,
    failureCode: null,
    filename: null,
    id: "backup_1",
    phase: "queued",
    progress: {
      processedBytes: 0,
      processedFiles: 0,
      totalBytes: null,
      totalFiles: null,
    },
    status: "queued",
    ...overrides,
  };
}

function renderSection(entry = "/acme/settings?tab=backups") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <BackupsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  capture.mockReset();
  toastSuccess.mockReset();
});

describe("BackupsSection", () => {
  it("creates a backup and shows queued progress", async () => {
    apiGet
      .mockResolvedValueOnce({ backup: null })
      .mockResolvedValue(makeBackup());
    apiPost.mockResolvedValueOnce(makeBackup());
    renderSection();

    const user = userEvent.setup();
    await user.click(await screen.findByText("organization.backups.create"));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/organization/backups", {
        timeout: 30_000,
      }),
    );
    expect(await screen.findByText("organization.backups.phase.queued")).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar")
        .getAttribute("aria-label"),
    ).toBe("organization.backups.phase.queued");
    expect(capture).toHaveBeenCalledWith("backup_requested");
  });

  it("loads exact emailed backup and requests signed download", async () => {
    apiGet
      .mockResolvedValueOnce(
        makeBackup({
          archiveSizeBytes: 2048,
          completedAt: "2026-07-15T10:01:00.000Z",
          expiresAt: "2026-07-16T10:01:00.000Z",
          filename: "acme-backup.zip",
          phase: "ready",
          status: "ready",
        }),
      )
      .mockResolvedValueOnce({
        downloadUrl: "https://storage.test/backup",
        expiresAt: "2026-07-15T10:11:00.000Z",
        filename: "acme-backup.zip",
      });
    renderSection("/acme/settings?tab=backups&backup=backup_1");

    expect(await screen.findByText("organization.backups.ready")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByText("organization.backups.download"));

    await waitFor(() =>
      expect(apiGet).toHaveBeenLastCalledWith(
        "/v1/organization/backups/backup_1/download-url",
      ),
    );
    expect(capture).toHaveBeenCalledWith("backup_downloaded");
  });

  it("offers a fresh export after expiry", async () => {
    apiGet.mockResolvedValueOnce(
      makeBackup({ phase: "expired", status: "expired" }),
    );
    renderSection("/acme/settings?tab=backups&backup=backup_1");

    expect(await screen.findByText("organization.backups.expired")).toBeTruthy();
    expect(screen.getByText("organization.backups.tryAgain")).toBeTruthy();
  });
});
