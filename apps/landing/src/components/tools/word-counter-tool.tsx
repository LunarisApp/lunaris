"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WordCounterCopy } from "@/data/word-counter-copy";
import type { Locale } from "@/i18n/config";
import { captureLandingEvent } from "@/lib/posthog";
import type { ReadabilityResult } from "@/lib/readability-analysis";
import type { SyllableMetrics } from "@/lib/syllable-analysis";
import {
	type AnalysisLanguage,
	analysisLanguages,
	analyzeText,
	lengthBucket,
	localeToAnalysisLanguage,
	MAIN_THREAD_TEXT_LIMIT,
	MAX_TEXT_LENGTH,
	MIN_READABILITY_WORDS,
	type TextMetrics,
} from "@/lib/word-analysis";
import { OpenInChat } from "./open-in-chat";

const languageOptions: readonly {
	label: string;
	value: AnalysisLanguage;
}[] = [
	{ label: "English", value: "en_US" },
	{ label: "Español", value: "es" },
	{ label: "Français", value: "fr" },
	{ label: "Deutsch", value: "de_DE" },
	{ label: "Português (Brasil)", value: "pt_BR" },
];

const languageStorageKey = "lunaris-word-counter-language";

type ReadabilityState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; result: ReadabilityResult }
	| { status: "unavailable" };

type SyllableState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; result: SyllableMetrics }
	| { status: "unavailable" };

type CoreMetricsState =
	| { status: "idle" }
	| {
			status: "loading" | "unavailable";
			language: AnalysisLanguage;
			text: string;
	  }
	| {
			status: "ready";
			language: AnalysisLanguage;
			result: TextMetrics;
			text: string;
	  };

const emptyMetrics: TextMetrics = {
	averageCharactersPerWord: 0,
	averageWordsPerSentence: 0,
	characters: 0,
	charactersWithoutSpaces: 0,
	longWords: 0,
	readingTimeSeconds: 0,
	sentences: 0,
	topWords: [],
	words: 0,
};

function LockIcon() {
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
				d="M7.5 10V7.75a4.5 4.5 0 0 1 9 0V10m-10.25 0h11.5c.69 0 1.25.56 1.25 1.25v8c0 .69-.56 1.25-1.25 1.25H6.25C5.56 20.5 5 19.94 5 19.25v-8C5 10.56 5.56 10 6.25 10Z"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M12 14v2.5" strokeLinecap="round" />
		</svg>
	);
}

function CopyIcon() {
	return (
		<svg
			aria-hidden="true"
			className="size-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			viewBox="0 0 24 24"
		>
			<path
				d="M8.75 8.75h9.5c.69 0 1.25.56 1.25 1.25v8.25c0 .69-.56 1.25-1.25 1.25H10c-.69 0-1.25-.56-1.25-1.25v-9.5Z"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M15.25 8.5V5.75c0-.69-.56-1.25-1.25-1.25H5.75c-.69 0-1.25.56-1.25 1.25V14c0 .69.56 1.25 1.25 1.25H8.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ArrowIcon() {
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
				d="M5 12h14m-5-5 5 5-5 5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FullscreenIcon({ active }: { active: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className="size-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			viewBox="0 0 24 24"
		>
			{active ? (
				<path
					d="M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			) : (
				<path
					d="M9 4H4v5m16 0V4h-5M4 15v5h5m6 0h5v-5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}
		</svg>
	);
}

function DisclosureIcon() {
	return (
		<svg
			aria-hidden="true"
			className="size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-90"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			viewBox="0 0 24 24"
		>
			<path
				d="m9 5 7 7-7 7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Metric({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: string;
	valueClassName?: string;
}) {
	return (
		<div className="grid min-w-0 py-4">
			<dt className="order-2 text-xs/5 font-medium tracking-wide text-olive-600 uppercase dark:text-olive-400">
				{label}
			</dt>
			<dd
				className={`order-1 text-2xl/7 font-medium tabular-nums text-olive-950 transition-opacity duration-150 motion-reduce:transition-none dark:text-white ${valueClassName ?? ""}`}
			>
				{value}
			</dd>
		</div>
	);
}

function isAnalysisLanguage(value: string): value is AnalysisLanguage {
	return analysisLanguages.some((language) => language === value);
}

export function WordCounterTool({
	copy,
	locale,
}: {
	copy: WordCounterCopy;
	locale: Locale;
}) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const organizationRef = useRef<HTMLDivElement>(null);
	const inputStartedRef = useRef(false);
	const reportedResultsRef = useRef(new Set<string>());
	const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const coreMetricsWorkerRef = useRef<Worker | null>(null);
	const coreMetricsRequestRef = useRef(0);
	const readabilityWorkerRef = useRef<Worker | null>(null);
	const readabilityRequestRef = useRef(0);
	const [text, setText] = useState("");
	const [language, setLanguage] = useState<AnalysisLanguage>(() =>
		localeToAnalysisLanguage(locale),
	);
	const [readability, setReadability] = useState<ReadabilityState>({
		status: "idle",
	});
	const [syllableMetrics, setSyllableMetrics] = useState<SyllableState>({
		status: "idle",
	});
	const [coreMetrics, setCoreMetrics] = useState<CoreMetricsState>({
		status: "idle",
	});
	const [copyStatus, setCopyStatus] = useState<
		"ready" | "copied" | "failed"
	>("ready");
	const [confirmClear, setConfirmClear] = useState(false);
	const [limitReached, setLimitReached] = useState(false);
	const [announcement, setAnnouncement] = useState("");
	const [actionAnnouncement, setActionAnnouncement] = useState("");
	const [isFullscreen, setIsFullscreen] = useState(false);

	const synchronousMetrics = useMemo(
		() =>
			text.length <= MAIN_THREAD_TEXT_LIMIT
				? analyzeText(text, language)
				: null,
		[text, language],
	);
	const currentWorkerMetrics =
		coreMetrics.status === "ready" &&
		coreMetrics.language === language &&
		coreMetrics.text === text
			? coreMetrics.result
			: null;
	const metrics = synchronousMetrics ?? currentWorkerMetrics ?? emptyMetrics;
	const metricsStatus =
		synchronousMetrics || currentWorkerMetrics
			? "ready"
			: coreMetrics.status === "unavailable" &&
					coreMetrics.language === language &&
					coreMetrics.text === text
				? "unavailable"
				: "loading";
	const metricsReady = metricsStatus === "ready";
	const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
	const decimalFormat = useMemo(
		() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
		[locale],
	);

	useEffect(() => {
		captureLandingEvent("free_tool_viewed", {
			locale,
			tool: "word_counter",
		});

		try {
			const savedLanguage = window.localStorage.getItem(languageStorageKey);
			if (savedLanguage && isAnalysisLanguage(savedLanguage)) {
				setLanguage(savedLanguage);
			}
		} catch {
			// Local storage can be unavailable in hardened browsing modes.
		}

		return () => {
			if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
			coreMetricsWorkerRef.current?.terminate();
			readabilityWorkerRef.current?.terminate();
		};
	}, [locale]);

	useEffect(() => {
		if (text.length <= MAIN_THREAD_TEXT_LIMIT) {
			coreMetricsRequestRef.current += 1;
			coreMetricsWorkerRef.current?.terminate();
			coreMetricsWorkerRef.current = null;
			setCoreMetrics((current) =>
				current.status === "idle" ? current : { status: "idle" },
			);
			return;
		}

		setCoreMetrics({ status: "loading", language, text });

		const timer = window.setTimeout(() => {
			try {
				const worker = new Worker(
					new URL("../../workers/core-analysis.worker.ts", import.meta.url),
					{ type: "module" },
				);
				coreMetricsWorkerRef.current = worker;

				const requestId = coreMetricsRequestRef.current + 1;
				coreMetricsRequestRef.current = requestId;

				const handleMessage = (
					event: MessageEvent<{ id: number; result: TextMetrics }>,
				) => {
					if (event.data.id !== requestId) return;
					worker.removeEventListener("message", handleMessage);
					worker.removeEventListener("error", handleError);
					if (coreMetricsRequestRef.current !== requestId) return;
					setCoreMetrics({
						status: "ready",
						language,
						result: event.data.result,
						text,
					});
				};
				const handleError = () => {
					worker.removeEventListener("message", handleMessage);
					worker.removeEventListener("error", handleError);
					worker.terminate();
					if (coreMetricsWorkerRef.current === worker) {
						coreMetricsWorkerRef.current = null;
					}
					if (coreMetricsRequestRef.current === requestId) {
						setCoreMetrics({ status: "unavailable", language, text });
					}
				};

				worker.addEventListener("message", handleMessage);
				worker.addEventListener("error", handleError);
				worker.postMessage({ id: requestId, language, text });
			} catch {
				coreMetricsWorkerRef.current?.terminate();
				coreMetricsWorkerRef.current = null;
				setCoreMetrics({ status: "unavailable", language, text });
			}
		}, 120);

		return () => {
			window.clearTimeout(timer);
			coreMetricsRequestRef.current += 1;
			coreMetricsWorkerRef.current?.terminate();
			coreMetricsWorkerRef.current = null;
		};
	}, [language, text]);

	useEffect(() => {
		if (!text.trim() || inputStartedRef.current) return;
		if (!metricsReady) return;
		inputStartedRef.current = true;
		captureLandingEvent("free_tool_input_started", {
			length_bucket: lengthBucket(metrics.words),
			tool: "word_counter",
		});
	}, [metrics.words, metricsReady, text]);

	useEffect(() => {
		if (!text.trim()) {
			readabilityRequestRef.current += 1;
			readabilityWorkerRef.current?.terminate();
			readabilityWorkerRef.current = null;
			setReadability({ status: "idle" });
			setSyllableMetrics({ status: "idle" });
			return;
		}

		if (!metricsReady) {
			setReadability(
				metricsStatus === "unavailable" || language !== "en_US"
					? { status: "idle" }
					: { status: "loading" },
			);
			setSyllableMetrics(
				metricsStatus === "unavailable"
					? { status: "unavailable" }
					: { status: "loading" },
			);
			return;
		}

		const shouldAnalyzeReadability =
			language === "en_US" && metrics.words >= MIN_READABILITY_WORDS;
		setReadability(
			shouldAnalyzeReadability ? { status: "loading" } : { status: "idle" },
		);
		setSyllableMetrics({ status: "loading" });

		const timer = window.setTimeout(() => {
			try {
				const worker =
					readabilityWorkerRef.current ??
					new Worker(
						new URL("../../workers/readability.worker.ts", import.meta.url),
						{ type: "module" },
					);
				readabilityWorkerRef.current = worker;

				const requestId = readabilityRequestRef.current + 1;
				readabilityRequestRef.current = requestId;

				const handleMessage = (
					event: MessageEvent<{
						id: number;
						result: {
							readability: ReadabilityResult | null;
							syllables: SyllableMetrics;
						};
					}>,
				) => {
					if (event.data.id !== requestId) return;
					worker.removeEventListener("message", handleMessage);
					worker.removeEventListener("error", handleError);
					if (readabilityRequestRef.current !== requestId) return;
					setSyllableMetrics({
						status: "ready",
						result: event.data.result.syllables,
					});
					if (shouldAnalyzeReadability) {
						setReadability(
							event.data.result.readability
								? {
										status: "ready",
										result: event.data.result.readability,
									}
								: { status: "unavailable" },
						);
					}
				};
				const handleError = () => {
					worker.removeEventListener("message", handleMessage);
					worker.removeEventListener("error", handleError);
					worker.terminate();
					if (readabilityWorkerRef.current === worker) {
						readabilityWorkerRef.current = null;
					}
					if (readabilityRequestRef.current === requestId) {
						setSyllableMetrics({ status: "unavailable" });
						if (shouldAnalyzeReadability) {
							setReadability({ status: "unavailable" });
						}
					}
				};

				worker.addEventListener("message", handleMessage);
				worker.addEventListener("error", handleError);
				worker.postMessage({
					id: requestId,
					includeReadability: shouldAnalyzeReadability,
					language,
					text,
				});
			} catch {
				setSyllableMetrics({ status: "unavailable" });
				if (shouldAnalyzeReadability) {
					setReadability({ status: "unavailable" });
				}
			}
		}, 200);

		return () => {
			window.clearTimeout(timer);
			readabilityRequestRef.current += 1;
			readabilityWorkerRef.current?.terminate();
			readabilityWorkerRef.current = null;
		};
	}, [language, metrics.words, metricsReady, metricsStatus, text]);

	useEffect(() => {
		if (!metricsReady || !metrics.words) {
			setAnnouncement("");
			return;
		}

		const timer = window.setTimeout(() => {
			const readabilityMessage =
				readability.status === "ready"
					? ` ${copy.metrics.readability}: ${copy.readability.bands[readability.result.band].label}.`
					: readability.status === "unavailable"
						? ` ${copy.readability.unavailable}`
						: "";
			setAnnouncement(
				`${numberFormat.format(metrics.words)} ${copy.metrics.words}. ${numberFormat.format(metrics.characters)} ${copy.metrics.characters}.${readabilityMessage}`,
			);
		}, 600);

		return () => window.clearTimeout(timer);
	}, [
		copy.metrics.characters,
		copy.metrics.readability,
		copy.metrics.words,
		copy.readability.bands,
		copy.readability.unavailable,
		metrics.characters,
		metrics.words,
		metricsReady,
		numberFormat,
		readability,
	]);

	useEffect(() => {
		const handleFullscreenChange = () => {
			setIsFullscreen(document.fullscreenElement === organizationRef.current);
		};

		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () =>
			document.removeEventListener("fullscreenchange", handleFullscreenChange);
	}, []);

	useEffect(() => {
		if (!metricsReady || !metrics.words) return;

		const resultKey = `${lengthBucket(metrics.words)}:${readability.status === "ready"}`;
		if (reportedResultsRef.current.has(resultKey)) return;
		reportedResultsRef.current.add(resultKey);

		captureLandingEvent("free_tool_result_viewed", {
			length_bucket: lengthBucket(metrics.words),
			readability_available: readability.status === "ready",
			tool: "word_counter",
		});
	}, [metrics.words, metricsReady, readability.status]);

	function updateLanguage(nextLanguage: AnalysisLanguage) {
		setLanguage(nextLanguage);
		try {
			window.localStorage.setItem(languageStorageKey, nextLanguage);
		} catch {
			// Analysis still works when local preference storage is unavailable.
		}
	}

	async function copyText() {
		if (!text) return;

		try {
			let copied = false;
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				copied = true;
			} else if (textareaRef.current) {
				const start = textareaRef.current.selectionStart;
				const end = textareaRef.current.selectionEnd;
				textareaRef.current.select();
				copied = document.execCommand("copy");
				textareaRef.current.setSelectionRange(start, end);
			}

			if (!copied) {
				setCopyStatus("failed");
				announceAction(copy.actions.copyFailed);
				return;
			}

			setCopyStatus("copied");
			announceAction(copy.actions.copied);
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
			copyTimerRef.current = setTimeout(() => setCopyStatus("ready"), 2000);
		} catch {
			setCopyStatus("failed");
			announceAction(copy.actions.copyFailed);
		}
	}

	function announceAction(message: string) {
		setActionAnnouncement("");
		window.requestAnimationFrame(() => setActionAnnouncement(message));
	}

	function requestClear() {
		if (!text) return;
		if (confirmClear) {
			setText("");
			setConfirmClear(false);
			setLimitReached(false);
			setCopyStatus("ready");
			announceAction(copy.actions.cleared);
			textareaRef.current?.focus();
			return;
		}

		setConfirmClear(true);
		announceAction(copy.actions.confirmClear);
		if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
		clearTimerRef.current = setTimeout(() => setConfirmClear(false), 4000);
	}

	function useExample() {
		setText(copy.example);
		setLimitReached(false);
		captureLandingEvent("free_tool_example_used", {
			tool: "word_counter",
		});
		window.requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			if (!textarea) return;
			textarea.focus();
			textarea.setSelectionRange(0, 0);
			textarea.scrollTop = 0;
		});
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === organizationRef.current) {
				await document.exitFullscreen();
			} else {
				await organizationRef.current?.requestFullscreen();
			}
		} catch {
			// The browser may deny fullscreen outside a trusted user interaction.
		}
	}

	function formatReadingTime(seconds: number) {
		if (!seconds) return "0 min";
		if (seconds < 60) return "< 1 min";
		return `${numberFormat.format(Math.ceil(seconds / 60))} min`;
	}

	const readabilityValue =
		metricsReady && readability.status === "ready"
			? copy.readability.bands[readability.result.band].label
			: "—";
	const coreMetricValue = (value: number, decimal = false) => {
		if (!metricsReady) return "—";
		return decimal
			? decimalFormat.format(value)
			: numberFormat.format(value);
	};
	const syllableValue = (key: keyof SyllableMetrics, decimal = false) => {
		if (!metricsReady) return "—";
		if (!metrics.words) return "0";
		if (syllableMetrics.status !== "ready") return "—";

		const value = syllableMetrics.result[key];
		return decimal
			? decimalFormat.format(value)
			: numberFormat.format(value);
	};
	const editorStatus = limitReached
		? copy.editor.limitReached
		: copyStatus === "failed"
			? copy.actions.copyFailed
			: metricsStatus === "loading"
				? copy.editor.analyzing
				: metricsStatus === "unavailable"
					? copy.editor.analysisUnavailable
					: null;

	return (
		<>
			<header className="mx-auto mb-8 max-w-3xl text-center sm:mb-10">
				<h1 className="text-balance font-display text-4xl/none tracking-[-0.025em] text-olive-950 sm:text-6xl dark:text-white">
					{copy.heading}
				</h1>
				<p className="mt-4 inline-flex items-center gap-2 text-sm/6 font-medium text-olive-600 dark:text-olive-300">
					<LockIcon />
					{copy.privacy}
				</p>
			</header>

			<div
				className={`overflow-hidden bg-olive-50 ring-1 ring-olive-950/10 ring-inset dark:bg-olive-900 dark:ring-white/10 ${
					isFullscreen
						? "flex h-screen w-screen flex-col rounded-none ring-0"
						: "rounded-2xl"
				}`}
				ref={organizationRef}
			>
				<div className={`flex flex-col ${isFullscreen ? "min-h-0 flex-1" : ""}`}>
					<div className="flex min-w-0 flex-1 flex-col">
						<div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-olive-950/10 px-4 py-2 sm:gap-3 sm:px-6 dark:border-white/10">
							<label
								className="text-sm/6 font-medium text-olive-800 dark:text-olive-200"
								htmlFor="word-counter-text"
							>
								{copy.editor.label}
							</label>
							<div className="flex min-w-0 items-center justify-end gap-1">
								{!text && (
									<button
										className="min-h-10 rounded-full px-3 text-sm/6 font-medium text-olive-700 transition hover:bg-olive-950/6 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 dark:text-olive-300 dark:hover:bg-white/8 dark:hover:text-white"
										onClick={useExample}
										type="button"
									>
										{copy.actions.tryExample}
									</button>
								)}
								{text && (
									<>
										{!confirmClear && (
											<>
												<OpenInChat
													label={copy.actions.openInChat}
													limitMessage={copy.actions.openInChatTooLong}
													query={text}
												/>
												<button
													aria-label={
														copyStatus === "copied"
															? copy.actions.copied
															: copy.actions.copy
													}
													className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm/6 font-medium text-olive-700 transition hover:bg-olive-950/6 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 dark:text-olive-300 dark:hover:bg-white/8 dark:hover:text-white"
													onClick={copyText}
													type="button"
												>
													<CopyIcon />
													<span className="hidden sm:inline">
														{copyStatus === "copied"
															? copy.actions.copied
															: copy.actions.copy}
													</span>
												</button>
											</>
										)}
										<button
											className="min-h-10 rounded-full px-3 text-sm/6 font-medium text-olive-600 transition hover:bg-olive-950/6 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 dark:text-olive-400 dark:hover:bg-white/8 dark:hover:text-white"
											onClick={requestClear}
											type="button"
										>
											{confirmClear
												? copy.actions.confirmClear
												: copy.actions.clear}
										</button>
										{confirmClear && (
											<button
												className="min-h-10 rounded-full px-3 text-sm/6 font-medium text-olive-600 transition hover:bg-olive-950/6 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 dark:text-olive-400 dark:hover:bg-white/8 dark:hover:text-white"
												onClick={() => setConfirmClear(false)}
												type="button"
											>
												{copy.actions.cancel}
											</button>
										)}
									</>
								)}
							</div>
						</div>

						<textarea
							className={`w-full flex-1 bg-transparent px-5 py-6 font-sans text-base/8 text-olive-950 outline-none placeholder:text-olive-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-olive-700 dark:focus-visible:ring-olive-300 sm:px-7 sm:py-7 sm:text-lg/9 dark:text-white dark:placeholder:text-olive-400 ${
								isFullscreen
									? "min-h-0 resize-none"
									: "min-h-[17rem] resize-y sm:min-h-[18rem]"
							}`}
							id="word-counter-text"
							maxLength={MAX_TEXT_LENGTH}
							onChange={(event) => {
								setText(event.target.value);
								setLimitReached(event.target.value.length >= MAX_TEXT_LENGTH);
								if (copyStatus !== "ready") setCopyStatus("ready");
							}}
							onPaste={(event) => {
								const pastedLength =
									event.clipboardData.getData("text").length;
								const selectionLength =
									event.currentTarget.selectionEnd -
									event.currentTarget.selectionStart;
								setLimitReached(
									text.length - selectionLength + pastedLength >
										MAX_TEXT_LENGTH,
								);
							}}
							placeholder={copy.editor.placeholder}
							ref={textareaRef}
							spellCheck="true"
							value={text}
						/>

						{editorStatus && (
							<p
								aria-live="polite"
								className="border-t border-olive-950/10 px-5 py-3 text-sm/6 text-olive-700 sm:px-7 dark:border-white/10 dark:text-olive-300"
							>
								{editorStatus}
							</p>
						)}
					</div>

					<div className="border-t border-olive-950/10 bg-white/35 px-5 sm:px-7 dark:border-white/10 dark:bg-black/8">
						<dl className="grid grid-cols-2 gap-x-6 [&>div:nth-child(n+3)]:border-t [&>div:nth-child(n+3)]:border-olive-950/10 sm:grid-cols-4 sm:[&>div:nth-child(n+3)]:border-t-0 dark:[&>div:nth-child(n+3)]:border-white/10">
							<Metric
								label={copy.metrics.words}
								value={coreMetricValue(metrics.words)}
							/>
							<Metric
								label={copy.metrics.characters}
								value={coreMetricValue(metrics.characters)}
							/>
							<Metric
								label={copy.metrics.readingTime}
								value={
									metricsReady
										? formatReadingTime(metrics.readingTimeSeconds)
										: "—"
								}
							/>
							<Metric
								label={copy.metrics.readability}
								value={readabilityValue}
								valueClassName="text-balance text-lg/6"
							/>
						</dl>
					</div>
				</div>
					<div className="flex flex-col gap-3 border-t border-olive-950/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-white/10">
						<p className="text-xs/5 text-olive-600 dark:text-olive-400">
							Powered by our open-source{" "}
							<a
								className="font-medium text-olive-800 underline decoration-olive-400/50 underline-offset-4 transition hover:text-olive-950 hover:decoration-olive-600 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 dark:text-olive-200 dark:decoration-olive-500/60 dark:hover:text-white"
								href="https://github.com/LunarisApp/text-tools"
								rel="noreferrer"
								target="_blank"
							>
								@LunarisApp/text-tools
							</a>
						</p>
						<div className="flex w-full items-center justify-end gap-3 sm:w-auto">
							<select
								aria-label={copy.controls.language}
								className="min-h-10 min-w-0 flex-1 rounded-full border border-olive-950/10 bg-white py-1.5 pr-8 pl-3 text-sm/6 text-olive-950 outline-none transition focus:border-olive-500 focus:ring-2 focus:ring-olive-700 dark:focus:ring-olive-300 sm:flex-none dark:border-white/10 dark:bg-white/5 dark:text-white"
								onChange={(event) => {
									const nextLanguage = event.target.value;
									if (isAnalysisLanguage(nextLanguage)) {
										updateLanguage(nextLanguage);
									}
								}}
								value={language}
							>
								{languageOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>

							<button
								aria-label={
									isFullscreen
										? copy.actions.exitFullscreen
										: copy.actions.enterFullscreen
								}
								className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-olive-950/10 bg-white px-3 text-sm/6 font-medium text-olive-700 transition hover:border-olive-950/20 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 dark:border-white/10 dark:bg-white/5 dark:text-olive-300 dark:hover:border-white/20 dark:hover:text-white"
								onClick={toggleFullscreen}
								title={
									isFullscreen
										? copy.actions.exitFullscreen
										: copy.actions.enterFullscreen
								}
								type="button"
							>
								<FullscreenIcon active={isFullscreen} />
								<span className="hidden xl:inline">
									{isFullscreen
										? copy.actions.exitFullscreen
										: copy.actions.enterFullscreen}
								</span>
							</button>
						</div>
					</div>
				</div>

			<div className="mt-10 divide-y divide-olive-950/10 border-y border-olive-950/10 dark:divide-white/10 dark:border-white/10">
				<details className="group">
					<summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-3 text-lg/7 font-medium text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600 [&::-webkit-details-marker]:hidden dark:text-white">
						<span>{copy.metrics.details}</span>
						<DisclosureIcon />
					</summary>
					<dl className="grid grid-cols-2 gap-x-8 gap-y-4 pb-6 sm:grid-cols-3">
						{[
							[
								copy.metrics.charactersWithoutSpaces,
								coreMetricValue(metrics.charactersWithoutSpaces),
							],
						].map(([label, value]) => (
							<div
								className="border-t border-olive-950/10 pt-3 dark:border-white/10"
								key={label}
							>
								<dt className="text-xs/5 text-olive-600 dark:text-olive-400">
									{label}
								</dt>
								<dd className="mt-1 text-lg/7 font-medium tabular-nums text-olive-950 dark:text-white">
									{value}
								</dd>
							</div>
						))}
						<div className="border-t border-olive-950/10 pt-3 dark:border-white/10">
							<dt className="text-xs/5 text-olive-600 dark:text-olive-400">
								{copy.metrics.topWords}
							</dt>
							<dd className="mt-2 flex flex-wrap gap-2">
								{metricsReady && metrics.topWords.length ? (
									metrics.topWords.map(({ count, word }) => (
										<span
											className="inline-flex items-baseline gap-1.5 rounded-full bg-olive-950/6 px-2.5 py-1 text-sm/5 text-olive-950 dark:bg-white/8 dark:text-white"
											key={word}
										>
											{word}
											<span className="text-xs/5 tabular-nums text-olive-600 dark:text-olive-400">
												{numberFormat.format(count)}
											</span>
										</span>
									))
								) : (
									<span className="text-lg/7 font-medium text-olive-950 dark:text-white">
										—
									</span>
								)}
							</dd>
						</div>
						{[
							[
								copy.metrics.sentences,
								coreMetricValue(metrics.sentences),
							],
							[
								copy.metrics.averageSentence,
								coreMetricValue(metrics.averageWordsPerSentence, true),
							],
							[
								copy.metrics.averageCharacters,
								coreMetricValue(metrics.averageCharactersPerWord, true),
							],
							[
								copy.metrics.longWords,
								coreMetricValue(metrics.longWords),
							],
							[copy.metrics.syllables, syllableValue("syllables")],
							[
								copy.metrics.averageSyllables,
								syllableValue("averageSyllablesPerWord", true),
							],
							[
								copy.metrics.polysyllableCount,
								syllableValue("polysyllableCount"),
							],
						].map(([label, value]) => (
							<div
								className="border-t border-olive-950/10 pt-3 dark:border-white/10"
								key={label}
							>
								<dt className="text-xs/5 text-olive-600 dark:text-olive-400">
									{label}
								</dt>
								<dd className="mt-1 text-lg/7 font-medium tabular-nums text-olive-950 dark:text-white">
									{value}
								</dd>
							</div>
						))}
					</dl>
				</details>

				<section className="py-7">
					<h2 className="text-lg/7 font-medium text-olive-950 dark:text-white">
						{copy.metrics.readability}
					</h2>

					<div className="mt-4">
						{metricsStatus === "loading" ? (
							<p className="animate-pulse text-sm/6 text-olive-600 motion-reduce:animate-none dark:text-olive-400">
								{copy.editor.analyzing}
							</p>
						) : metricsStatus === "unavailable" ? (
							<p className="text-sm/6 text-olive-600 dark:text-olive-400">
								{copy.editor.analysisUnavailable}
							</p>
						) : language !== "en_US" ? (
							<p className="text-sm/6 text-olive-600 dark:text-olive-400">
								{copy.readability.unsupported}
							</p>
						) : metrics.words < MIN_READABILITY_WORDS ? (
							<p className="text-sm/6 text-olive-600 dark:text-olive-400">
								{copy.readability.notEnough}
							</p>
						) : readability.status === "loading" ? (
							<p className="animate-pulse text-sm/6 text-olive-600 motion-reduce:animate-none dark:text-olive-400">
								{copy.readability.loading}
							</p>
						) : readability.status === "ready" ? (
							<div className="grid gap-6 sm:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)] sm:gap-8">
								<div>
									<p className="font-display text-3xl/8 text-olive-950 dark:text-white">
										{copy.readability.bands[readability.result.band].label}
									</p>
									<p className="mt-1 max-w-xl text-sm/6 text-olive-600 dark:text-olive-400">
										{
											copy.readability.bands[readability.result.band]
												.guidance
										}
									</p>
								</div>
								<div className="border-t border-olive-950/10 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-8 dark:border-white/10">
									<dl className="grid grid-cols-2 gap-4">
									<div>
										<dt className="text-xs/5 text-olive-600 dark:text-olive-400">
											{copy.readability.score}
										</dt>
										<dd className="mt-1 text-xl/7 font-medium tabular-nums text-olive-950 dark:text-white">
											{decimalFormat.format(readability.result.score)}
											<span className="ml-1 text-sm/5 font-normal text-olive-500 dark:text-olive-400">
												/100
											</span>
										</dd>
									</div>
									<div>
										<dt className="text-xs/5 text-olive-600 dark:text-olive-400">
											{copy.readability.grade}
										</dt>
										<dd className="mt-1 text-xl/7 font-medium tabular-nums text-olive-950 dark:text-white">
											{decimalFormat.format(readability.result.grade)}
											<span className="ml-1 text-sm/5 font-normal text-olive-500 dark:text-olive-400">
												/18
											</span>
										</dd>
									</div>
									</dl>
									<p className="mt-4 text-xs/5 text-olive-600 dark:text-olive-400">
										{copy.readability.formula}
									</p>
								</div>
							</div>
						) : readability.status === "unavailable" ? (
							<p className="text-sm/6 text-olive-600 dark:text-olive-400">
								{copy.readability.unavailable}
							</p>
						) : null}
					</div>
				</section>

				<aside className="flex flex-col gap-5 py-7 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-display text-2xl/8 text-olive-950 dark:text-white">
							{copy.cta.title}
						</p>
						<p className="mt-1 max-w-2xl text-sm/6 text-olive-600 dark:text-olive-400">
							{copy.cta.body}
						</p>
					</div>
					<a
						className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-olive-950 px-4 py-2 text-sm/7 font-medium text-white transition hover:bg-olive-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 sm:self-auto dark:bg-olive-200 dark:text-olive-950 dark:hover:bg-olive-100"
						href="https://web.lunaris.app"
						onClick={() =>
							captureLandingEvent("free_tool_cta_clicked", {
								destination: "web",
								location: "word_counter_bottom",
								tool: "word_counter",
							})
						}
					>
						{copy.cta.open}
						<ArrowIcon />
					</a>
				</aside>
			</div>

			<p
				aria-atomic="true"
				aria-live="polite"
				className="sr-only"
				role="status"
			>
				{announcement}
			</p>
			<p
				aria-atomic="true"
				aria-live="polite"
				className="sr-only"
				role="status"
			>
				{actionAnnouncement}
			</p>
		</>
	);
}
