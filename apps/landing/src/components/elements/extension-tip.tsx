"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ExtensionIcon } from "@/components/elements/extension-icon";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";

export function ExtensionTip({
	id,
	src,
	name,
	description,
	href,
}: {
	id: string;
	src?: string;
	name: string;
	description: string;
	href: string;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const trigger = useRef<HTMLButtonElement>(null);
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const dismiss = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (root.current?.contains(document.activeElement))
				trigger.current?.focus();
			setOpen(false);
		};
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target))
				setOpen(false);
		};
		document.addEventListener("keydown", dismiss);
		document.addEventListener("pointerdown", outside);
		return () => {
			document.removeEventListener("keydown", dismiss);
			document.removeEventListener("pointerdown", outside);
		};
	}, [open]);
	return (
		<div
			ref={root}
			role="group"
			aria-label={name}
			className="relative"
			onPointerEnter={(event) => {
				if (event.pointerType === "mouse") setOpen(true);
			}}
			onPointerLeave={(event) => {
				if (
					event.pointerType === "mouse" &&
					!root.current?.contains(document.activeElement)
				)
					setOpen(false);
			}}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
		>
			<button
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				ref={trigger}
				type="button"
				className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl py-2 text-center text-[0.8125rem]/5 font-medium transition-colors hover:bg-olive-200 aria-expanded:bg-olive-200 motion-reduce:transition-none dark:hover:bg-olive-800 dark:aria-expanded:bg-olive-800"
				onFocus={() => setOpen(true)}
				onClick={() => setOpen(true)}
			>
				<ExtensionIcon
					id={id}
					src={src}
					className="size-14 rounded-xl sm:size-16"
				/>
				<span>{name}</span>
			</button>
			{open && (
				<div
					className="absolute top-full left-0 z-20 w-56 pt-3 max-[390px]:group-even/extension:right-0 max-[390px]:group-even/extension:left-auto min-[390px]:group-nth-2/extension:left-1/2 min-[390px]:group-nth-2/extension:-translate-x-1/2 min-[390px]:group-nth-3/extension:right-0 min-[390px]:group-nth-3/extension:left-auto"
					id={panelId}
				>
					<Link
						href={href}
						className="group block rounded-xl bg-olive-50 p-4 text-olive-950 shadow-[0_8px_28px_-6px_rgba(31,31,27,0.22)] dark:bg-olive-800 dark:text-olive-100 dark:shadow-[0_8px_28px_-6px_rgba(0,0,0,0.5)]"
					>
						<span className="flex items-center justify-between gap-4 text-sm/5 font-semibold">
							{name}
							<ArrowNarrowRightIcon className="size-4 shrink-0 text-olive-500 group-hover:text-olive-950 dark:text-olive-400 dark:group-hover:text-olive-100" />
						</span>
						<span className="mt-2 block text-[0.8125rem]/5 text-pretty text-olive-700 dark:text-olive-300">
							{description}
						</span>
					</Link>
				</div>
			)}
		</div>
	);
}
