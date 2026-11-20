"use client";

import { Copy01Icon, HugeiconsIcon, Tick02Icon } from "@lunarisapp/ui/icons";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@lunarisapp/ui/components/tabs";
import { useEffect, useState } from "react";

interface InstallMethod {
	label: string;
	command: string;
}

export function InstallCommandPicker({
	methods,
	methodLabel,
	copyLabel,
	copiedLabel,
	manualCopyLabel,
}: {
	methods: readonly [InstallMethod, ...InstallMethod[]];
	methodLabel: string;
	copyLabel: string;
	copiedLabel: string;
	manualCopyLabel: string;
}) {
	return (
		<Tabs className="min-w-0 flex-col gap-3" defaultValue={methods[0].label}>
			<TabsList
				activateOnFocus
				aria-label={methodLabel}
				className="max-w-full items-stretch gap-1 self-start rounded-xl bg-olive-950/5 p-1 dark:bg-white/5"
			>
				{methods.map(({ label }) => (
					<TabsTrigger
						key={label}
						value={label}
						className="h-auto min-h-11 flex-auto rounded-lg px-2 text-xs text-olive-700 whitespace-normal hover:text-olive-950 focus-visible:outline-offset-2 data-active:bg-olive-950 data-active:text-white data-active:hover:text-white sm:px-3 sm:text-sm dark:text-olive-400 dark:hover:text-white dark:data-active:bg-olive-200 dark:data-active:text-olive-950 dark:data-active:hover:text-olive-950 motion-reduce:transition-none"
					>
						{label}
					</TabsTrigger>
				))}
			</TabsList>
			{methods.map(({ label, command }) => (
				<TabsContent
					key={label}
					value={label}
					className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					<CopyCommand
						command={command}
						copyLabel={copyLabel}
						copiedLabel={copiedLabel}
						manualCopyLabel={manualCopyLabel}
					/>
				</TabsContent>
			))}
		</Tabs>
	);
}

function CopyCommand({
	command,
	copyLabel,
	copiedLabel,
	manualCopyLabel,
}: {
	command: string;
	copyLabel: string;
	copiedLabel: string;
	manualCopyLabel: string;
}) {
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

	useEffect(() => {
		if (status !== "copied") return;
		const timeout = window.setTimeout(() => setStatus("idle"), 1800);
		return () => window.clearTimeout(timeout);
	}, [status]);

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(command);
			setStatus("copied");
		} catch {
			setStatus("failed");
		}
	}

	return (
		<div className="min-w-0">
			<div className="flex items-center gap-1 rounded-lg bg-olive-950/5 pl-4 pr-1 text-olive-950 dark:bg-olive-800 dark:text-olive-100">
				<code className="min-w-0 grow select-all whitespace-pre-wrap [overflow-wrap:anywhere] py-3 font-[ui-monospace,monospace] text-xs/6">
					{command}
				</code>
				<button
					type="button"
					aria-label={copyLabel}
					title={copyLabel}
					onClick={copyCommand}
					className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-olive-950/5 focus-visible:outline-2 dark:hover:bg-white/10"
				>
					<HugeiconsIcon
						aria-hidden="true"
						className="size-4"
						icon={status === "copied" ? Tick02Icon : Copy01Icon}
					/>
				</button>
			</div>
			<span
				role="status"
				className={status === "failed" ? "mt-1 block text-xs" : "sr-only"}
			>
				{status === "failed"
					? manualCopyLabel
					: status === "copied"
						? copiedLabel
						: ""}
			</span>
		</div>
	);
}
