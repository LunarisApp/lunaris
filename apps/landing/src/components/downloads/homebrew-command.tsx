"use client";

import { Copy01Icon, HugeiconsIcon, Tick02Icon } from "@lunarisapp/ui/icons";
import { useEffect, useState } from "react";

const command = "brew install --formula lunarisapp/tap/lunaris";

export function HomebrewCommand({
	copyLabel,
	copiedLabel,
	manualCopyLabel,
}: {
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
				<code className="min-w-0 grow select-all break-words py-3 text-xs/6">
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
