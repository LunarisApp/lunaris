/** @vitest-environment happy-dom */

import type { ItemInstance, TreeInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { act, renderHook } from "@testing-library/react";
import { createElement, createRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";

const wrapper = ({ children }: { children: ReactNode }) =>
	createElement(HotkeyOverridesProvider, null, children);

const capturedHotkey = {
	current: null as
		| null
		| {
				handler: () => void;
				key: string;
				options?: Record<string, unknown>;
		  },
};

vi.mock("@tanstack/react-hotkeys", () => ({
	HotkeysProvider: ({ children }: { children: unknown }) => children,
	useHotkey: (key: string, handler: () => void, options?: Record<string, unknown>) => {
		capturedHotkey.current = { key, handler, options };
	},
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

function makeItem(): ItemInstance<WorkspaceResourceEntity> {
	return {
		startRenaming: vi.fn(),
	} as unknown as ItemInstance<WorkspaceResourceEntity>;
}

function makeTree(selected: ItemInstance<WorkspaceResourceEntity>[]): TreeInstance<WorkspaceResourceEntity> {
	return {
		getSelectedItems: () => selected,
	} as unknown as TreeInstance<WorkspaceResourceEntity>;
}

describe("useRenameKeyboardShortcut", () => {
	beforeEach(() => {
		capturedHotkey.current = null;
	});

	it("starts renaming when tree context is active", async () => {
		const item = makeItem();
		const tree = makeTree([item]);
		const target = createRef<HTMLDivElement>();
		const { useRenameKeyboardShortcut } = await import("./use-rename-keyboard-shortcut");

		renderHook(() => useRenameKeyboardShortcut({ tree, target }), { wrapper });

		act(() => {
			capturedHotkey.current?.handler();
		});

		expect(item.startRenaming).toHaveBeenCalledTimes(1);
		expect(capturedHotkey.current?.options).toEqual(
			expect.objectContaining({
				target,
				meta: expect.objectContaining({
					hotkeyId: "rename-resource",
					name: "commands.renameResource",
				}),
			}),
		);
	});

	it("passes the provided tree target to TanStack", async () => {
		const tree = makeTree([makeItem()]);
		const target = createRef<HTMLDivElement>();
		const { useRenameKeyboardShortcut } = await import("./use-rename-keyboard-shortcut");

		renderHook(() => useRenameKeyboardShortcut({ tree, target }), { wrapper });

		expect(capturedHotkey.current).toEqual(
			expect.objectContaining({
				key: "F2",
				options: expect.objectContaining({ target }),
			}),
		);
	});
});
