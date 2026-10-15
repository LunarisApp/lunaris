import { clsx } from "clsx/lite";
import type { ComponentProps, ReactNode } from "react";
import { Section } from "../elements/section";
import { Wallpaper } from "../elements/wallpaper";

type Feature = {
	headline: string;
	subheadline: string;
};

export type BentoFeatures = {
	dataOwnership: Feature;
	offlineFirst: Feature;
	extensions: Feature;
	collaboration: Feature;
	aiReady: Feature;
	fastLightweight: Feature;
	crossPlatform: Feature;
};

type FeatureKind = keyof BentoFeatures;

const cards: {
	kind: FeatureKind;
	className: string;
	wallpaper: ComponentProps<typeof Wallpaper>["color"];
	compact?: boolean;
}[] = [
	{
		kind: "dataOwnership",
		className: "sm:col-span-2 lg:col-span-4",
		wallpaper: "brown",
	},
	{
		kind: "offlineFirst",
		className: "lg:col-span-4",
		wallpaper: "purple",
	},
	{
		kind: "extensions",
		className: "lg:col-span-4",
		wallpaper: "blue",
	},
	{
		kind: "collaboration",
		className: "lg:col-span-3",
		wallpaper: "teal",
		compact: true,
	},
	{
		kind: "aiReady",
		className: "lg:col-span-3",
		wallpaper: "gold",
		compact: true,
	},
	{
		kind: "fastLightweight",
		className: "lg:col-span-3",
		wallpaper: "coral",
		compact: true,
	},
	{
		kind: "crossPlatform",
		className: "lg:col-span-3",
		wallpaper: "green",
		compact: true,
	},
];

function FeatureIcon({
	kind,
	className,
}: {
	kind: FeatureKind;
	className?: string;
}) {
	const paths: Record<FeatureKind, ReactNode> = {
		dataOwnership: (
			<>
				<path d="M12 3 5.5 5.5v5.75c0 4.15 2.75 7.85 6.5 9.25 3.75-1.4 6.5-5.1 6.5-9.25V5.5L12 3Z" />
				<path d="m9 12 2 2 4-4" />
			</>
		),
		offlineFirst: (
			<>
				<path d="M5.5 16.5h-.25A3.75 3.75 0 0 1 4.5 9.08 6.5 6.5 0 0 1 16.42 7.5 4.5 4.5 0 0 1 20 14.56" />
				<path d="m3 3 18 18" />
			</>
		),
		extensions: (
			<>
				<rect height="7" rx="1.5" width="7" x="3" y="3" />
				<rect height="7" rx="1.5" width="7" x="14" y="3" />
				<rect height="7" rx="1.5" width="7" x="3" y="14" />
				<path d="M17.5 14v7M14 17.5h7" />
			</>
		),
		collaboration: (
			<>
				<circle cx="9" cy="8" r="3" />
				<path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
				<path d="M16 5.2a3 3 0 0 1 0 5.6M17 14a5 5 0 0 1 3.5 5" />
			</>
		),
		aiReady: (
			<>
				<path d="M12 2.5c.75 4.25 3.25 6.75 7.5 7.5-4.25.75-6.75 3.25-7.5 7.5-.75-4.25-3.25-6.75-7.5-7.5C8.75 9.25 11.25 6.75 12 2.5Z" />
				<path d="M19 16.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5Z" />
			</>
		),
		fastLightweight: <path d="m13.5 2-8 12h6l-1 8 8-12h-6l1-8Z" />,
		crossPlatform: (
			<>
				<rect height="11" rx="2" width="14" x="3" y="4" />
				<path d="M8 20h4M10 15v5" />
				<rect height="10" rx="1.5" width="6" x="15" y="10" />
			</>
		),
	};

	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			viewBox="0 0 24 24"
		>
			{paths[kind]}
		</svg>
	);
}

function FeatureArtwork({ kind }: { kind: FeatureKind }) {
	if (kind === "dataOwnership") {
		return (
			<div aria-hidden="true" className="relative h-36 w-52">
				<div className="absolute inset-x-5 top-1 bottom-1 flex flex-col overflow-hidden rounded-2xl border border-olive-950/10 bg-white/55 shadow-sm dark:border-white/10 dark:bg-white/8">
					<div className="flex h-8 items-center gap-1.5 border-b border-olive-950/8 px-3 dark:border-white/8">
						<div className="size-1.5 rounded-full bg-olive-950/20 dark:bg-white/25" />
						<div className="size-1.5 rounded-full bg-olive-950/12 dark:bg-white/15" />
					</div>
					<div className="flex flex-1 items-center justify-center">
						<div className="flex size-16 items-center justify-center rounded-2xl border border-olive-950/10 bg-white/50 dark:border-white/10 dark:bg-white/6">
							<FeatureIcon
								className="size-9 text-olive-800 dark:text-white/75"
								kind={kind}
							/>
						</div>
					</div>
				</div>
				<div className="absolute right-0 bottom-0 flex size-11 items-center justify-center rounded-full border-4 border-white/50 bg-olive-900 text-white shadow-sm dark:border-white/10 dark:bg-olive-100 dark:text-olive-900">
					<svg
						aria-hidden="true"
						className="size-5"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						viewBox="0 0 24 24"
					>
						<path d="M8 11V8a4 4 0 1 1 8 0v3" strokeLinecap="round" />
						<rect height="9" rx="2" width="12" x="6" y="11" />
					</svg>
				</div>
			</div>
		);
	}

	if (kind === "extensions") {
		return (
			<div aria-hidden="true" className="grid grid-cols-2 gap-2">
				{[0, 1, 2].map((index) => (
					<div
						className="flex size-14 items-center justify-center rounded-xl border border-olive-950/10 bg-white/50 shadow-sm dark:border-white/10 dark:bg-white/8"
						key={index}
					>
						<div className="size-4 rounded-sm border border-olive-950/30 dark:border-white/35" />
					</div>
				))}
				<div className="flex size-14 items-center justify-center rounded-xl border border-dashed border-olive-950/25 dark:border-white/25">
					<FeatureIcon
						className="size-6 text-olive-700 dark:text-white/65"
						kind={kind}
					/>
				</div>
			</div>
		);
	}

	if (kind === "collaboration") {
		return (
			<div aria-hidden="true" className="relative h-32 w-52">
				<div className="absolute inset-y-0 left-3 w-40 rounded-xl border border-olive-950/10 bg-white/55 p-4 shadow-sm dark:border-white/10 dark:bg-white/8">
					<div className="h-2 w-16 rounded-full bg-olive-950/18 dark:bg-white/25" />
					<div className="mt-4 space-y-2">
						<div className="h-1.5 w-full rounded-full bg-olive-950/10 dark:bg-white/12" />
						<div className="h-1.5 w-4/5 rounded-full bg-olive-950/10 dark:bg-white/12" />
						<div className="h-1.5 w-2/3 rounded-full bg-olive-950/10 dark:bg-white/12" />
					</div>
					<div className="mt-5 h-6 rounded-md border border-olive-950/8 bg-white/35 dark:border-white/8 dark:bg-white/4" />
				</div>
				<div className="absolute top-4 right-3 text-[#6c5572] dark:text-[#d4b9dc]">
					<svg
						aria-hidden="true"
						className="h-9 w-7 drop-shadow-sm"
						fill="currentColor"
						viewBox="0 0 28 34"
					>
						<path d="M3 2.5 24.5 20l-10.2 1.2L8.5 30 3 2.5Z" />
					</svg>
					<div className="-mt-1 ml-5 h-4 w-10 rounded-full bg-current opacity-75" />
				</div>
				<div className="absolute right-8 bottom-1 text-[#52705c] dark:text-[#a9c8b1]">
					<svg
						aria-hidden="true"
						className="h-8 w-6 -rotate-12 drop-shadow-sm"
						fill="currentColor"
						viewBox="0 0 28 34"
					>
						<path d="M3 2.5 24.5 20l-10.2 1.2L8.5 30 3 2.5Z" />
					</svg>
					<div className="-mt-1 ml-4 h-4 w-12 rounded-full bg-current opacity-75" />
				</div>
			</div>
		);
	}

	if (kind === "offlineFirst") {
		return (
			<div
				aria-hidden="true"
				className="relative flex size-36 items-center justify-center"
			>
				<div className="absolute inset-0 rounded-full border border-dashed border-olive-950/12 dark:border-white/12" />
				<div className="absolute inset-5 rounded-full border border-olive-950/10 bg-white/15 dark:border-white/10 dark:bg-white/3" />
				<div className="absolute inset-10 rounded-full border border-olive-950/12 dark:border-white/12" />
				<div className="absolute top-0 left-1/2 h-4 border-l border-olive-950/15 dark:border-white/15" />
				<div className="absolute top-1/2 right-0 w-4 border-t border-olive-950/15 dark:border-white/15" />
				<div className="relative flex size-18 items-center justify-center rounded-full border border-olive-950/10 bg-white/65 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/8">
					<FeatureIcon
						className="size-9 text-olive-800 dark:text-white/75"
						kind={kind}
					/>
				</div>
				<div className="absolute top-4 right-5 size-2.5 rounded-full bg-olive-700/45 ring-4 ring-white/25 dark:bg-white/40 dark:ring-white/5" />
			</div>
		);
	}

	if (kind === "fastLightweight") {
		return (
			<div aria-hidden="true" className="relative h-36 w-44">
				<svg
					aria-hidden="true"
					className="absolute inset-0 size-full text-olive-950 dark:text-white"
					fill="none"
					viewBox="0 0 176 144"
				>
					<defs>
						<linearGradient id="fast-trail" x1="0" x2="1" y1="0" y2="0">
							<stop stopColor="currentColor" stopOpacity="0" />
							<stop offset="1" stopColor="currentColor" stopOpacity="0.24" />
						</linearGradient>
					</defs>
					<path
						d="M4 34c38 0 70 8 116 34"
						stroke="url(#fast-trail)"
						strokeLinecap="round"
						strokeWidth="2"
					/>
					<path
						d="M0 58c48 0 79 5 120 14"
						stroke="url(#fast-trail)"
						strokeLinecap="round"
						strokeWidth="1.25"
					/>
					<path
						d="M6 76h114"
						stroke="url(#fast-trail)"
						strokeLinecap="round"
						strokeWidth="2.5"
					/>
					<path
						d="M0 96c48 0 79-5 120-14"
						stroke="url(#fast-trail)"
						strokeLinecap="round"
						strokeWidth="1.25"
					/>
					<path
						d="M4 120c38 0 70-8 116-34"
						stroke="url(#fast-trail)"
						strokeLinecap="round"
						strokeWidth="2"
					/>
					<circle cx="30" cy="47" fill="currentColor" opacity="0.1" r="2" />
					<circle cx="18" cy="76" fill="currentColor" opacity="0.14" r="1.5" />
					<circle cx="42" cy="108" fill="currentColor" opacity="0.12" r="1" />
				</svg>
				<div className="absolute top-1/2 right-1 flex size-20 -translate-y-1/2 items-center justify-center rounded-full border border-olive-950/10 bg-white/70 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/10">
					<FeatureIcon
						className="size-10 text-olive-800 dark:text-white/75"
						kind={kind}
					/>
				</div>
			</div>
		);
	}

	return (
		<div
			aria-hidden="true"
			className="relative flex size-36 items-center justify-center"
		>
			<div className="absolute inset-0 rounded-full border border-olive-950/8 dark:border-white/8" />
			<div className="absolute inset-4 rotate-12 rounded-4xl border border-olive-950/10 bg-white/25 dark:border-white/10 dark:bg-white/3" />
			<div className="relative flex size-20 items-center justify-center rounded-3xl border border-olive-950/10 bg-white/60 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/8">
				<FeatureIcon
					className="size-9 text-olive-800 dark:text-white/75"
					kind={kind}
				/>
			</div>
			<div className="absolute top-2 right-3 size-2 rounded-full bg-white/80 dark:bg-white/30" />
			<div className="absolute bottom-4 left-1 size-3 rounded-full border border-olive-950/15 dark:border-white/15" />
		</div>
	);
}

function BentoCard({
	feature,
	kind,
	className,
	wallpaper,
	compact,
}: { feature: Feature } & (typeof cards)[number]) {
	return (
		<article
			className={clsx(
				"group flex overflow-hidden rounded-2xl ring-1 ring-olive-950/6 motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 dark:ring-white/8",
				className,
			)}
		>
			<Wallpaper className="flex-1 [&>div:last-child]:h-full" color={wallpaper}>
				<div className="absolute -top-20 -right-20 size-56 rounded-full bg-white/20 blur-3xl dark:bg-white/5" />
				<div
					className={clsx(
						"relative flex h-full flex-col bg-olive-950/60",
						compact ? "min-h-52 gap-4 p-6 sm:p-7" : "min-h-80 gap-6 p-7 sm:p-8",
					)}
				>
					{!compact && (
						<div className="flex flex-1 items-center justify-center">
							<FeatureArtwork kind={kind} />
						</div>
					)}
					<div
						className={clsx(
							"mt-auto max-w-sm",
							compact ? "sm:h-44" : "sm:h-32",
						)}
					>
						{compact && (
							<div className="mb-3 flex size-9 items-center justify-center rounded-xl border border-white/15 bg-white/10">
								<FeatureIcon className="size-5 text-white/80" kind={kind} />
							</div>
						)}
						<h3 className="text-lg font-medium tracking-tight text-white">
							{feature.headline}
						</h3>
						<p
							className={clsx(
								"text-sm text-white",
								compact ? "mt-1.5 leading-6" : "mt-2 leading-7",
							)}
						>
							{feature.subheadline}
						</p>
					</div>
				</div>
			</Wallpaper>
		</article>
	);
}

export function FeaturesBentoGrid({
	features,
	...props
}: { features: BentoFeatures } & Omit<
	ComponentProps<typeof Section>,
	"children"
>) {
	return (
		<Section {...props}>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12">
				{cards.map((card) => (
					<BentoCard feature={features[card.kind]} key={card.kind} {...card} />
				))}
			</div>
		</Section>
	);
}
