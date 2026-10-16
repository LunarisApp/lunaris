"use client";

import Claude from "@thesvg/react/claude";
import OpenaiChatgpt from "@thesvg/react/openai-chatgpt";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

const providers = [
	{
		Icon: OpenaiChatgpt,
		id: "chatgpt",
		label: "ChatGPT",
		url: (query: string) =>
			`https://chatgpt.com/?${new URLSearchParams({
				hints: "search",
				prompt: query,
			})}`,
	},
	{
		Icon: Claude,
		id: "claude",
		label: "Claude",
		url: (query: string) =>
			`https://claude.ai/new?${new URLSearchParams({ q: query })}`,
	},
] as const;

export const MAX_CHAT_URL_LENGTH = 8_000;

export function openInChatQueryExceedsLimit(query: string) {
	if (query.length > MAX_CHAT_URL_LENGTH) return true;
	return providers.some(
		(provider) => provider.url(query).length > MAX_CHAT_URL_LENGTH,
	);
}

function ChatIcon() {
	return (
		<svg
			aria-hidden="true"
			className="size-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			viewBox="0 0 24 24"
		>
			<path
				d="M7.25 18.25 4 20v-4.5A7.25 7.25 0 0 1 3 11.8C3 7.49 7.03 4 12 4s9 3.49 9 7.8-4.03 7.8-9 7.8a10.4 10.4 0 0 1-4.75-1.35Z"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ChevronIcon() {
	return (
		<svg
			aria-hidden="true"
			className="size-3.5"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			viewBox="0 0 24 24"
		>
			<path d="m7 9.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ExternalLinkIcon() {
	return (
		<svg
			aria-hidden="true"
			className="size-3.5"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			viewBox="0 0 24 24"
		>
			<path
				d="M14 5h5v5m0-5-8 8m6 0v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function OpenInChat({
	label,
	limitMessage,
	query,
}: {
	label: string;
	limitMessage: string;
	query: string;
}) {
	const [open, setOpen] = useState(false);
	const [tooltipDismissed, setTooltipDismissed] = useState(false);
	const tooltipId = useId();
	const triggerId = useId();
	const menuId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
	const exceedsUrlLimit = openInChatQueryExceedsLimit(query);

	useEffect(() => {
		if (!open) return;

		function handlePointerDown(event: PointerEvent) {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		}

		function handleEscape(event: globalThis.KeyboardEvent) {
			if (event.key !== "Escape") return;
			setOpen(false);
			triggerRef.current?.focus();
		}

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open]);

	useEffect(() => {
		if (!exceedsUrlLimit) return;

		function handleTooltipEscape(event: globalThis.KeyboardEvent) {
			if (event.key === "Escape") setTooltipDismissed(true);
		}

		document.addEventListener("keydown", handleTooltipEscape);
		return () => document.removeEventListener("keydown", handleTooltipEscape);
	}, [exceedsUrlLimit]);

	function focusItem(index: number) {
		itemRefs.current[index]?.focus();
	}

	function handleTriggerClick() {
		if (exceedsUrlLimit) return;
		if (open) {
			setOpen(false);
			return;
		}

		setOpen(true);
		window.requestAnimationFrame(() => focusItem(0));
	}

	function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (exceedsUrlLimit) return;
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		event.preventDefault();
		setOpen(true);
		window.requestAnimationFrame(() =>
			focusItem(event.key === "ArrowDown" ? 0 : providers.length - 1),
		);
	}

	function handleItemKeyDown(
		event: KeyboardEvent<HTMLAnchorElement>,
		index: number,
	) {
		if (event.key === "Tab") {
			setOpen(false);
			return;
		}

		let nextIndex: number | null = null;

		if (event.key === "ArrowDown") {
			nextIndex = (index + 1) % providers.length;
		} else if (event.key === "ArrowUp") {
			nextIndex = (index - 1 + providers.length) % providers.length;
		} else if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = providers.length - 1;
		}

		if (nextIndex === null) return;
		event.preventDefault();
		focusItem(nextIndex);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Blur bubbles from the menu controls; this wrapper is not an interactive target.
		<div
			className="group relative rounded-full"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
			ref={rootRef}
		>
			<button
				aria-label={label}
				aria-controls={menuId}
				aria-describedby={
					exceedsUrlLimit && !tooltipDismissed ? tooltipId : undefined
				}
				aria-disabled={exceedsUrlLimit}
				aria-expanded={open && !exceedsUrlLimit}
				aria-haspopup="menu"
				className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm/6 font-medium text-olive-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 dark:text-olive-300 ${
					exceedsUrlLimit
						? "cursor-not-allowed opacity-40"
						: "hover:bg-olive-950/6 hover:text-olive-950 dark:hover:bg-white/8 dark:hover:text-white"
				}`}
				id={triggerId}
				onClick={handleTriggerClick}
				onFocus={() => setTooltipDismissed(false)}
				onKeyDown={handleTriggerKeyDown}
				onPointerEnter={() => setTooltipDismissed(false)}
				ref={triggerRef}
				type="button"
			>
				<ChatIcon />
				<span className="hidden sm:inline">{label}</span>
				<ChevronIcon />
			</button>

			{exceedsUrlLimit && !tooltipDismissed && (
				<div
					className="invisible absolute top-full right-0 z-40 w-max max-w-64 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 motion-reduce:transition-none"
					id={tooltipId}
					role="tooltip"
				>
					<div className="rounded-lg bg-olive-950 px-3 py-2 text-xs/5 font-medium text-white shadow-lg dark:bg-olive-100 dark:text-olive-950">
						{limitMessage}
					</div>
				</div>
			)}

			{open && !exceedsUrlLimit && (
				<div
					aria-labelledby={triggerId}
					className="absolute top-full right-0 z-30 mt-1 w-52 rounded-xl border border-olive-950/10 bg-olive-50 p-1.5 shadow-[0_18px_50px_-20px_rgba(22,25,18,0.65)] dark:border-white/10 dark:bg-olive-900 dark:shadow-black/60"
					id={menuId}
					role="menu"
				>
					{providers.map((provider, index) => (
						<a
							aria-label={`${label}: ${provider.label}`}
							className="flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm/6 font-medium text-olive-700 outline-none transition hover:bg-olive-950/6 hover:text-olive-950 focus:bg-olive-950/6 focus:text-olive-950 dark:text-olive-300 dark:hover:bg-white/8 dark:hover:text-white dark:focus:bg-white/8 dark:focus:text-white"
							href={provider.url(query)}
							key={provider.id}
							onClick={() => setOpen(false)}
							onKeyDown={(event) => handleItemKeyDown(event, index)}
							ref={(element) => {
								itemRefs.current[index] = element;
							}}
							rel="noopener noreferrer"
							role="menuitem"
							tabIndex={index === 0 ? 0 : -1}
							target="_blank"
						>
							<span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-olive-950/10 bg-white text-olive-950 dark:border-white/10 dark:bg-white/8 dark:text-white">
								<provider.Icon aria-hidden="true" className="size-4" />
							</span>
							<span className="flex-1">{provider.label}</span>
							<ExternalLinkIcon />
						</a>
					))}
				</div>
			)}
		</div>
	);
}
