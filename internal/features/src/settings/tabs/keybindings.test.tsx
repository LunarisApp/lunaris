/** @vitest-environment happy-dom */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postHogCapture = vi.fn();
const platformKind = vi.hoisted(() => ({ current: "web" as "desktop" | "web" }));

vi.mock("@repo/platform", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@repo/platform")>();
	return {
		...actual,
		usePlatform: () => ({ kind: platformKind.current }),
	};
});

vi.mock("posthog-js", () => ({
	default: { capture: (...args: unknown[]) => postHogCapture(...args) },
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

// Bypass the recorder entirely for the tab-level test; row rendering is covered
// by keybinding-row.test.tsx.
vi.mock("@tanstack/react-hotkeys", () => ({
	useHotkeyRecorder: () => ({
		isRecording: false,
		recordedHotkey: null,
		startRecording: vi.fn(),
		stopRecording: vi.fn(),
		cancelRecording: vi.fn(),
	}),
}));

// Strip alert-dialog down to plain DOM so we can drive the confirm flow without
// portal / focus-trap machinery.
vi.mock("@lunarisapp/ui/components/alert-dialog", () => ({
	AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	AlertDialogAction: ({
		children,
		onClick,
		...rest
	}: {
		children: ReactNode;
		onClick?: () => void;
		"data-testid"?: string;
	}) => (
		<button onClick={onClick} {...rest}>
			{children}
		</button>
	),
	AlertDialogCancel: ({ children }: { children: ReactNode }) => (
		<button>{children}</button>
	),
	AlertDialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	AlertDialogDescription: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	AlertDialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	AlertDialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	AlertDialogTitle: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	AlertDialogTrigger: ({
		children,
		render,
	}: {
		children: ReactNode;
		render: ReactNode;
	}) => (
		<div>
			{render}
			{children}
		</div>
	),
}));

import {
	HOTKEYS,
	HotkeyOverridesProvider,
	useHotkeyOverrides,
} from "../../hotkeys";
import { KeybindingsContent } from "./keybindings";

function Wrapper({ children }: { children: ReactNode }) {
	return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

beforeEach(() => {
	postHogCapture.mockClear();
});

afterEach(() => {
	window.localStorage.clear();
	platformKind.current = "web";
});

describe("KeybindingsContent", () => {
	it("warns about shortcut conflicts only in the browser", () => {
		const { rerender } = render(
			<Wrapper>
				<KeybindingsContent />
			</Wrapper>,
		);

		const browserConflictNote = screen.getByRole("note");
		expect(browserConflictNote.textContent).toContain(
			"settings.keybindings.browserConflictTitle",
		);
		expect(browserConflictNote.textContent).toContain(
			"settings.keybindings.browserConflictDescription",
		);

		platformKind.current = "desktop";
		rerender(
			<Wrapper>
				<KeybindingsContent />
			</Wrapper>,
		);

		expect(screen.queryByRole("note")).toBeNull();
	});

	it("renders all registered hotkeys grouped by category", () => {
		render(
			<Wrapper>
				<KeybindingsContent />
			</Wrapper>,
		);

		const expectedSections = [
			{
				category: "general",
				hotkeyIds: [
					"toggle-search",
					"open-settings",
					"copy-resources",
					"paste-resources",
					"delete-resource",
				],
			},
			{
				category: "navigation",
				hotkeyIds: [
					"open-home",
					"open-workspace",
					"open-ai-workflows",
					"open-team-chats",
				],
			},
			{
				category: "workspaces",
				hotkeyIds: [
					"open-workspace-explorer",
					"open-extensions",
					"open-debugger",
					"new-tab",
					"close-tab",
					"move-panel-to-new-window",
					"rename-resource",
					"toggle-focus-mode",
				],
			},
		] as const;
		const sections = screen
			.getByTestId("settings-panel-keybindings")
			.querySelectorAll("section");

		expect(sections).toHaveLength(expectedSections.length);
		expectedSections.forEach(({ category, hotkeyIds }, index) => {
			const section = sections[index] as HTMLElement;
			expect(section.getAttribute("aria-labelledby")).toBe(
				`keybindings-${category}-heading`,
			);
			expect(
				within(section).getByText(
					`settings.keybindings.categories.${category}`,
				),
			).toBeTruthy();
			for (const id of hotkeyIds) {
				expect(
					within(section).getByTestId(`keybinding-row-${id}`),
				).toBeTruthy();
			}
		});

		// One row per registered hotkey
		const rows = screen
			.getAllByTestId(/^keybinding-row-/)
			.map((el) => el.getAttribute("data-testid"));
		expect(rows).toHaveLength(Object.keys(HOTKEYS).length);
	});

	it("reset-all button is disabled when no overrides are set", () => {
		render(
			<Wrapper>
				<KeybindingsContent />
			</Wrapper>,
		);
		const btn = screen.getByTestId(
			"keybindings-reset-all",
		) as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it("reset-all confirm clears overrides, closes dialog, captures posthog", async () => {
		const user = userEvent.setup();

		function Probe() {
			const setOverride = useHotkeyOverrides((s) => s.setOverride);
			setOverride("toggle-search", "Mod+J");
			return null;
		}

		render(
			<Wrapper>
				<Probe />
				<KeybindingsContent />
			</Wrapper>,
		);

		// Trigger is enabled once an override exists
		const trigger = screen.getByTestId(
			"keybindings-reset-all",
		) as HTMLButtonElement;
		expect(trigger.disabled).toBe(false);

		// Confirm in the (mocked) dialog
		await user.click(screen.getByTestId("keybindings-reset-all-confirm"));

		expect(postHogCapture).toHaveBeenCalledWith("keybindings_reset_all");
	});
});
