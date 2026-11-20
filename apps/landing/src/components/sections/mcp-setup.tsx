"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@lunarisapp/ui/components/select";
import { clsx } from "clsx/lite";
import { useEffect, useId, useState } from "react";
import {
	ClaudeIcon,
	CodexIcon,
	CursorIcon,
	McpIcon,
} from "@/components/icons/harness-icons";
import type { DataRegion } from "@/data/regions";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { captureLandingEvent } from "@/lib/posthog";

type McpCopy = Dictionary["mcpPage"]["setup"];

type HarnessId = "mcp" | "claude" | "codex" | "cursor";

const desktopMcpCommand = "/Applications/Lunaris.app/Contents/MacOS/Lunaris";
const desktopMcpArguments = ["mcp", "serve", "--access", "read"] as const;

function mcpUrl(region: DataRegion) {
	if (region.status === "planned") return "";

	const url = new URL(region.manifestUrl);
	url.pathname = "/mcp";
	url.search = "";
	url.hash = "";
	return url.toString();
}

function localSetupSnippet(harness: HarnessId) {
	const argumentsList = desktopMcpArguments.join(" ");

	if (harness === "mcp") {
		return `transport: stdio
command: ${desktopMcpCommand}
args: ${argumentsList}`;
	}
	if (harness === "claude") {
		return `claude mcp add --transport stdio lunaris -- ${desktopMcpCommand} ${argumentsList}`;
	}
	if (harness === "codex") {
		return `codex mcp add lunaris -- ${desktopMcpCommand} ${argumentsList}`;
	}
	return JSON.stringify(
		{
			mcpServers: {
				lunaris: {
					command: desktopMcpCommand,
					args: desktopMcpArguments,
				},
			},
		},
		null,
		2,
	);
}

function cloudSetupSnippet(harness: HarnessId, url: string) {
	if (harness === "mcp") return `transport: http\nurl: ${url}`;
	if (harness === "claude")
		return `claude mcp add --transport http lunaris ${url}`;
	if (harness === "codex") return `codex mcp add lunaris --url ${url}`;
	return `{
  "mcpServers": {
    "lunaris": {
      "url": "${url}"
    }
  }
}`;
}

function cursorInstallUrl(url: string) {
	const config = btoa(JSON.stringify({ url }));

	return `cursor://anysphere.cursor-deeplink/mcp/install?name=Lunaris&config=${encodeURIComponent(config)}`;
}

function CopyIcon({ copied }: { copied: boolean }) {
	if (copied) {
		return (
			<svg
				aria-hidden="true"
				className="size-4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				viewBox="0 0 24 24"
			>
				<path
					d="m5 12.5 4 4L19 6.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	return (
		<svg
			aria-hidden="true"
			className="size-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			viewBox="0 0 24 24"
		>
			<path
				d="M8.25 7.5v-1.5A2.25 2.25 0 0 1 10.5 3.75h7.5A2.25 2.25 0 0 1 20.25 6v7.5A2.25 2.25 0 0 1 18 15.75h-1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<rect height="12" rx="2.25" width="12" x="3.75" y="8.25" />
		</svg>
	);
}

function CopySetup({
	copy,
	snippet,
	harness,
	regionId,
}: {
	copy: McpCopy;
	snippet: string;
	harness: HarnessId;
	regionId: string;
}) {
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	useEffect(() => {
		if (status !== "copied") return;
		const timeout = window.setTimeout(() => setStatus("idle"), 1800);
		return () => window.clearTimeout(timeout);
	}, [status]);
	async function copySnippet() {
		try {
			await navigator.clipboard.writeText(snippet);
		} catch {
			setStatus("failed");
			return;
		}
		setStatus("copied");
		captureLandingEvent("mcp_setup_copied", { harness, region: regionId });
	}
	return (
		<div className="max-w-[60%] text-right">
			<button
				className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/8 px-3.5 py-1.5 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
				onClick={copySnippet}
				type="button"
			>
				<CopyIcon copied={status === "copied"} />
				<span aria-live="polite">
					{status === "copied" ? copy.copied : copy.copy}
				</span>
			</button>
			<p role="status" className="text-xs/5">
				{status === "failed" ? copy.manualCopy : ""}
			</p>
		</div>
	);
}

export function McpSetup({
	regions,
	copy,
}: {
	regions: readonly DataRegion[];
	copy: McpCopy;
}) {
	const defaultRegion = regions.find((region) => region.status === "available");
	const regionSelectId = useId();
	const regionOptions = regions.map((item) => ({
		value: item.regionId,
		label:
			item.status === "planned"
				? `${item.displayName} · ${copy.comingSoon}`
				: item.displayName,
		disabled: item.status !== "available",
	}));
	const harnesses = [
		{
			id: "mcp",
			name: copy.genericName,
			icon: McpIcon,
		},
		{ id: "claude", name: "Claude Code", icon: ClaudeIcon },
		{ id: "codex", name: "Codex", icon: CodexIcon },
		{ id: "cursor", name: "Cursor", icon: CursorIcon },
	] as const;
	const [harness, setHarness] = useState<HarnessId>("mcp");
	const [regionId, setRegionId] = useState(defaultRegion?.regionId ?? "");
	const [connection, setConnection] = useState<"cloud" | "desktop">(
		defaultRegion ? "cloud" : "desktop",
	);
	const desktop = connection === "desktop";
	const region = regions.find(
		(item) => item.regionId === regionId && item.status === "available",
	);
	const endpoint = !desktop && region ? mcpUrl(region) : "";
	const snippet = desktop
		? localSetupSnippet(harness)
		: cloudSetupSnippet(harness, endpoint);
	const cursorDeeplink = endpoint ? cursorInstallUrl(endpoint) : "";
	const isConfig = harness === "cursor";
	const isGeneric = harness === "mcp";

	return (
		<div className="grid overflow-hidden rounded-3xl bg-white/60 shadow-[0_24px_80px_-48px_rgba(20,20,17,0.45)] ring-1 ring-olive-950/10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] dark:bg-white/5 dark:shadow-black/30 dark:ring-white/15">
			<div className="flex min-w-0 flex-col gap-8 border-b border-olive-950/10 p-6 sm:gap-10 sm:p-8 lg:border-r lg:border-b-0 lg:p-10 dark:border-white/15">
				<fieldset>
					<legend className="flex items-center gap-3 text-sm font-semibold text-olive-950 dark:text-white">
						<span className="inline-flex size-6 items-center justify-center rounded-full bg-olive-700 text-xs text-white dark:bg-olive-200 dark:text-olive-950">
							1
						</span>
						{copy.connectionLabel}
					</legend>
					<div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-olive-950/5 p-1 dark:bg-white/5">
						{(["cloud", "desktop"] as const).map((target) => (
							<button
								type="button"
								key={target}
								aria-pressed={connection === target}
								disabled={target === "cloud" && !defaultRegion}
								onClick={() => setConnection(target)}
								className="min-h-11 rounded-md px-2 text-sm font-medium aria-pressed:bg-olive-950 aria-pressed:text-white disabled:opacity-50 focus-visible:outline-2 dark:text-olive-200 dark:aria-pressed:bg-olive-200 dark:aria-pressed:text-black"
							>
								{target === "desktop" ? copy.desktopName : copy.cloudName}
							</button>
						))}
					</div>
					{desktop ? (
						<p className="mt-4 text-sm/6 text-olive-700 dark:text-olive-300">
							{copy.desktopDescription}
						</p>
					) : (
						<div className="mt-4 flex flex-col gap-2 text-sm font-medium text-olive-950 dark:text-olive-100">
							<label htmlFor={regionSelectId}>{copy.regionLabel}</label>
							<Select
								items={regionOptions}
								value={regionId}
								onValueChange={(value) => {
									if (value !== null) setRegionId(value);
								}}
							>
								<SelectTrigger
									className="min-h-11 w-full border-olive-950/15 bg-olive-100 px-3 hover:bg-olive-200 dark:border-white/20 dark:bg-black dark:hover:bg-olive-900"
									id={regionSelectId}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									{regionOptions.map((item) => (
										<SelectItem
											className="min-h-9 px-3 pr-8 data-highlighted:bg-olive-200 dark:data-highlighted:bg-olive-800"
											disabled={item.disabled}
											key={item.value}
											value={item.value}
										>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</fieldset>

				<fieldset>
					<legend className="flex items-center gap-3 text-sm font-semibold text-olive-950 dark:text-white">
						<span className="inline-flex size-6 items-center justify-center rounded-full bg-olive-700 text-xs text-white dark:bg-olive-200 dark:text-olive-950">
							2
						</span>
						{copy.harnessLabel}
					</legend>
					<div className="mt-5 grid auto-rows-fr grid-cols-2 gap-3">
						{harnesses.map((item) => {
							const Icon = item.icon;
							const selected = harness === item.id;
							return (
								<button
									aria-pressed={selected}
									className={clsx(
										"group flex h-full min-h-28 w-full flex-col items-start justify-between rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 dark:focus-visible:outline-olive-200",
										selected
											? "border-olive-700 bg-olive-200 text-olive-950 shadow-sm dark:border-olive-200 dark:bg-olive-200 dark:text-olive-950"
											: "border-olive-950/10 bg-white/60 text-olive-950 hover:border-olive-950/25 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10",
									)}
									key={item.id}
									onClick={() => {
										setHarness(item.id);
									}}
									type="button"
								>
									<span
										className={clsx(
											"inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
											item.id === "cursor" && "bg-[#171717] p-1.5",
											item.id === "codex" && "bg-white p-1.5",
											item.id === "claude" && "bg-white p-1.5 text-black",
											item.id === "mcp" && "bg-olive-700 p-1.5 text-white",
										)}
									>
										<Icon aria-hidden="true" className="size-full" />
									</span>
									<span className="block text-sm font-medium">{item.name}</span>
								</button>
							);
						})}
					</div>
				</fieldset>
			</div>

			<div className="flex min-w-0 flex-col bg-olive-700 p-6 text-white sm:p-8 lg:min-h-[31rem] lg:p-10 dark:bg-olive-900/70">
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-xs font-medium tracking-[0.16em] text-olive-300 uppercase">
							{isGeneric
								? copy.detailsLabel
								: isConfig
									? copy.configLabel
									: copy.commandLabel}
						</p>
						<p className="mt-1 text-sm text-olive-300">
							{isGeneric
								? desktop
									? "stdio"
									: "HTTP"
								: isConfig
									? harness === "cursor"
										? ".cursor/mcp.json"
										: ""
									: "~ terminal"}
						</p>
					</div>
					<CopySetup
						key={snippet}
						copy={copy}
						snippet={snippet}
						harness={harness}
						regionId={desktop ? "desktop" : regionId}
					/>
				</div>

				<pre className="mt-8 max-w-full select-all whitespace-pre-wrap break-words rounded-xl bg-white/7 p-4 text-xs/6 text-olive-100 ring-1 ring-white/12 sm:mt-10 sm:break-normal sm:p-5 sm:text-sm/7 dark:bg-black/15 dark:ring-white/15">
					<code>{snippet}</code>
				</pre>

				{harness === "cursor" && endpoint && (
					<a
						className="mt-6 block w-fit rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
						href={cursorDeeplink}
						onClick={() => {
							captureLandingEvent("mcp_setup_opened", {
								harness: "cursor",
								region: region?.regionId ?? null,
							});
						}}
					>
						{/* eslint-disable-next-line @next/next/no-img-element -- Cursor hosts the deeplink badge. */}
						<img
							alt="Install Lunaris MCP in Cursor"
							className="h-8"
							src="https://cursor.com/deeplink/mcp-install-light.svg"
						/>
					</a>
				)}

				<div className="mt-8 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2 lg:mt-auto lg:pt-8">
					<div className="flex gap-3">
						<svg
							aria-hidden="true"
							className="mt-0.5 size-5 shrink-0 text-olive-300"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 3.75a6 6 0 0 0-6 6v2.25H4.5v8.25h15V12H18V9.75a6 6 0 0 0-6-6Zm-4.5 8.25V9.75a4.5 4.5 0 0 1 9 0V12"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						<p className="text-sm/6 text-olive-300">
							{desktop ? copy.desktopAuthNote : copy.authNote}
						</p>
					</div>
					<div className="flex gap-3">
						<svg
							aria-hidden="true"
							className="mt-0.5 size-5 shrink-0 text-olive-300"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 21s7.5-3.75 7.5-10.5V5.25L12 2.25 4.5 5.25v5.25C4.5 17.25 12 21 12 21Z"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path
								d="m9 11.5 2 2 4-4"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						<p className="text-sm/6 text-olive-300">
							{desktop ? copy.desktopDataNote : copy.dataNote}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
