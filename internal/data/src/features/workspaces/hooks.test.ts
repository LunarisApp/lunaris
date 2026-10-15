/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceSync } from "./hooks";

vi.mock("@powersync/react", () => ({
	useSyncStream: vi.fn(),
}));

const { useSyncStream } = await import("@powersync/react");
const useSyncStreamMock = vi.mocked(useSyncStream);

function syncedStatus(hasSynced: boolean) {
	return { subscription: { hasSynced } };
}

describe("useWorkspaceSync", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSyncStreamMock.mockReturnValue(syncedStatus(true) as never);
	});

	it("subscribes to one workspace content stream", () => {
		const { result } = renderHook(() => useWorkspaceSync("workspace_1", "shared"));

		expect(useSyncStreamMock).toHaveBeenCalledWith({
			name: "workspace_content",
			ttl: 604800,
			parameters: { workspace_id: "workspace_1" },
		});
		expect(result.current).toEqual({
			hasSynced: true,
			isLoading: false,
			streams: {
				workspace_content: { hasSynced: true, isLoading: false },
			},
		});
	});

	it("skips cloud content for local workspaces", () => {
		const { result } = renderHook(() => useWorkspaceSync("workspace_1", "local"));

		expect(useSyncStreamMock).toHaveBeenCalledWith({
			name: "workspace_content",
			ttl: 604800,
			parameters: null,
		});
		expect(result.current).toEqual({
			hasSynced: true,
			isLoading: false,
			streams: {
				workspace_content: { hasSynced: true, isLoading: false },
			},
		});
	});

	it("reports unresolved subscriptions as loading", () => {
		useSyncStreamMock.mockReturnValue(null);

		const { result } = renderHook(() => useWorkspaceSync("workspace_1", "shared"));

		expect(result.current).toEqual({
			hasSynced: false,
			isLoading: true,
			streams: {
				workspace_content: { hasSynced: false, isLoading: true },
			},
		});
	});
});
