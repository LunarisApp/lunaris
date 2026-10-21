"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ExtensionIcon } from "@/components/elements/extension-icon";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import type { CatalogExtension } from "@/data/extension-types";
import type { ExtensionsCopy } from "@/data/extensions";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import {
	type ExtensionFilter,
	filterExtensions,
} from "@/lib/extension-catalog";

export function ExtensionCatalog({
	extensions,
	copy,
	locale,
}: {
	extensions: readonly CatalogExtension[];
	copy: ExtensionsCopy;
	locale: Locale;
}) {
	const searchId = useId();
	const resultsId = useId();
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<ExtensionFilter>("all");

	useEffect(() => {
		const readFilters = () => {
			const params = new URLSearchParams(window.location.search);
			const kind = params.get("type");
			setQuery(params.get("q") ?? "");
			setFilter(kind === "catalog" || kind === "built-in" ? kind : "all");
		};
		readFilters();
		window.addEventListener("popstate", readFilters);
		return () => window.removeEventListener("popstate", readFilters);
	}, []);

	function updateFilters(nextQuery: string, nextFilter: ExtensionFilter) {
		setQuery(nextQuery);
		setFilter(nextFilter);
		const url = new URL(window.location.href);
		if (nextQuery.trim()) url.searchParams.set("q", nextQuery);
		else url.searchParams.delete("q");
		if (nextFilter !== "all") url.searchParams.set("type", nextFilter);
		else url.searchParams.delete("type");
		window.history.replaceState(window.history.state, "", url);
	}

	const results = filterExtensions(extensions, query, filter, copy);
	const filters = [
		{ value: "all", label: copy.all, count: extensions.length },
		{
			value: "catalog",
			label: copy.catalog,
			count: extensions.filter((extension) => !extension.builtIn).length,
		},
		{
			value: "built-in",
			label: copy.builtIn,
			count: extensions.filter((extension) => extension.builtIn).length,
		},
	] as const;

	return (
		<div id="toolkit" className="scroll-mt-28">
			<div className="relative max-w-xl">
				<label className="sr-only" htmlFor={searchId}>
					{copy.searchLabel}
				</label>
				<svg
					aria-hidden="true"
					className="pointer-events-none absolute top-3.5 left-4 size-5 text-olive-600 dark:text-olive-400"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<circle cx="10.5" cy="10.5" r="6.5" />
					<path d="m16 16 5 5" />
				</svg>
				<input
					aria-controls={resultsId}
					className="min-h-12 w-full rounded-xl border border-olive-950/20 bg-white/50 pr-14 pl-12 text-base/6 text-olive-950 placeholder:text-olive-600 dark:border-white/20 dark:bg-white/5 dark:text-olive-100 dark:placeholder:text-olive-400 [&::-webkit-search-cancel-button]:appearance-none"
					id={searchId}
					onChange={(event) => updateFilters(event.target.value, filter)}
					placeholder={copy.searchPlaceholder}
					type="search"
					value={query}
				/>
				{query && (
					<button
						aria-label={copy.clearSearch}
						className="absolute top-0.5 right-1 flex size-11 items-center justify-center rounded-lg text-olive-700 hover:bg-olive-200 dark:text-olive-300 dark:hover:bg-olive-800"
						onClick={() => {
							updateFilters("", filter);
							document.getElementById(searchId)?.focus();
						}}
						type="button"
					>
						<svg
							aria-hidden="true"
							className="size-4"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeWidth={1.5}
							viewBox="0 0 20 20"
						>
							<path d="m5 5 10 10M15 5 5 15" />
						</svg>
					</button>
				)}
			</div>
			<div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-olive-950/15 pb-5 dark:border-white/20">
				<div
					aria-label={copy.filterLabel}
					className="flex flex-wrap gap-1"
					role="group"
				>
					{filters.map((item) => (
						<button
							aria-controls={resultsId}
							aria-pressed={filter === item.value}
							className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm/6 font-medium text-olive-700 transition-colors hover:bg-olive-200/70 aria-pressed:bg-olive-950 aria-pressed:text-white dark:text-olive-300 dark:hover:bg-white/10 dark:aria-pressed:bg-olive-200 dark:aria-pressed:text-olive-950"
							key={item.value}
							onClick={() => updateFilters(query, item.value)}
							type="button"
						>
							{item.label}
							<span className="text-xs/5 tabular-nums">{item.count}</span>
						</button>
					))}
				</div>
				<p
					aria-live="polite"
					aria-atomic="true"
					className="text-sm/6 text-olive-600 dark:text-olive-400"
					role="status"
				>
					{(results.length === 1 ? copy.resultOne : copy.resultMany).replace(
						"{count}",
						new Intl.NumberFormat(locale).format(results.length),
					)}
				</p>
			</div>
			<div id={resultsId}>
				{results.length > 0 ? (
					<ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{results.map((extension) => (
							<li
								id={extension.slug}
								className="scroll-mt-28"
								key={extension.id}
							>
								<Link
									className="group flex h-full flex-col rounded-xl border border-olive-950/15 p-5 text-olive-950 transition-colors hover:bg-olive-200/40 dark:border-white/20 dark:text-olive-100 dark:hover:bg-white/5"
									href={localePath(locale, `/extensions/${extension.slug}`)}
								>
									<div className="flex items-center gap-3">
										<ExtensionIcon
											className="size-12 rounded-xl"
											id={extension.slug}
											src={extension.iconUrl}
										/>
										<div className="min-w-0">
											<h2 className="text-base/6 font-semibold">
												{extension.name}
											</h2>
											<p className="mt-0.5 text-xs/5 text-olive-600 dark:text-olive-400">
												{extension.developer}
											</p>
										</div>
									</div>
									<p className="mt-4 text-sm/6 text-pretty text-olive-700 dark:text-olive-300">
										{copy.items[extension.slug]?.description ??
											extension.description}
									</p>
									<div className="mt-auto flex items-center justify-between gap-3 pt-5">
										<span className="text-xs/5 text-olive-600 dark:text-olive-400">
											{extension.builtIn ? copy.builtIn : copy.catalog} · v
											{extension.version}
										</span>
										<span className="inline-flex items-center gap-1 text-xs/5 font-medium group-hover:underline underline-offset-4">
											{copy.viewDetails}
											<ArrowNarrowRightIcon />
										</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				) : (
					<div className="py-20 text-center">
						<h2 className="text-lg/7 font-semibold text-olive-950 dark:text-olive-100">
							{copy.emptyTitle}
						</h2>
						<p className="mx-auto mt-2 max-w-md text-sm/6 text-olive-700 dark:text-olive-300">
							{copy.emptyDescription}
						</p>
						<button
							className="mt-5 min-h-11 rounded-full bg-olive-950 px-5 py-2 text-sm/6 font-medium text-white dark:bg-olive-200 dark:text-olive-950"
							onClick={() => {
								updateFilters("", "all");
								document.getElementById(searchId)?.focus();
							}}
							type="button"
						>
							{copy.clearFilters}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
