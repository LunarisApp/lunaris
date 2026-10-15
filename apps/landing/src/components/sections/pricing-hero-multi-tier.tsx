import {
	ElTabGroup,
	ElTabList,
	ElTabPanels,
} from "@tailwindplus/elements/react";
import { clsx } from "clsx/lite";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "../elements/container";
import { Heading } from "../elements/heading";
import { Text } from "../elements/text";
import { CheckmarkIcon } from "../icons/checkmark-icon";

export function Plan({
	name,
	price,
	period,
	subheadline,
	badge,
	features,
	cta,
	className,
}: {
	name: ReactNode;
	price: ReactNode;
	period?: ReactNode;
	subheadline: ReactNode;
	badge?: ReactNode;
	features: ReactNode[];
	cta: ReactNode;
} & ComponentProps<"div">) {
	return (
		<div
			className={clsx(
				"flex flex-col justify-between gap-7 rounded-xl bg-olive-950/2.5 p-6 ring-1 ring-olive-950/10 sm:items-start dark:bg-white/5 dark:ring-white/10",
				className,
			)}
		>
			<div className="self-stretch">
				<div className="flex min-h-7 items-center justify-between gap-3">
					{badge && (
						<div className="order-last inline-flex rounded-full bg-olive-950/10 px-2.5 py-0.5 text-xs/5 font-medium text-olive-950 dark:bg-white/10 dark:text-white">
							{badge}
						</div>
					)}

					<h2 className="text-xl/7 font-medium tracking-tight text-olive-950 dark:text-white">
						{name}
					</h2>
				</div>
				<p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
					<span className="text-3xl/9 font-semibold tracking-tight text-olive-950 dark:text-white">
						{price}
					</span>
					{period && (
						<span className="text-sm/6 text-olive-600 dark:text-olive-400">
							{period}
						</span>
					)}
				</p>
				<div className="mt-5 flex min-h-12 flex-col gap-4 text-sm/6 text-olive-700 dark:text-olive-400">
					{subheadline}
				</div>
				<ul className="mt-5 space-y-2.5 text-sm/6 text-olive-700 dark:text-olive-400">
					{features.map((feature) => (
						<li className="flex gap-3" key={String(feature)}>
							<CheckmarkIcon className="h-lh shrink-0 stroke-olive-600 dark:stroke-olive-300" />
							<p>{feature}</p>
						</li>
					))}
				</ul>
			</div>
			{cta}
		</div>
	);
}

export function PricingHeroMultiTier<T extends string>({
	eyebrow,
	headline,
	subheadline,
	options,
	plans,
	footer,
	className,
	...props
}: {
	eyebrow?: ReactNode;
	headline: ReactNode;
	subheadline: ReactNode;
	options: readonly T[];
	plans: Record<T, ReactNode>;
	footer?: ReactNode;
} & ComponentProps<"section">) {
	return (
		<section className={clsx("pt-16 pb-20 sm:pt-20", className)} {...props}>
			<ElTabGroup>
				<Container className="flex flex-col gap-12 sm:gap-14">
					<div className="flex flex-col items-center gap-6">
						{eyebrow}
						<Heading>{headline}</Heading>
						<Text
							className="flex max-w-xl flex-col gap-4 text-center"
							size="lg"
						>
							{subheadline}
						</Text>
						<ElTabList className="flex items-center gap-1 rounded-full bg-olive-950/5 p-1 ring-1 ring-olive-950/5 dark:bg-white/5 dark:ring-white/10">
							{options.map((option) => (
								<button
									className="rounded-full px-4 py-1 text-sm/7 font-medium text-olive-700 transition-colors hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 aria-selected:bg-olive-950 aria-selected:text-white dark:text-olive-300 dark:hover:text-white dark:focus-visible:outline-olive-200 dark:aria-selected:bg-olive-200 dark:aria-selected:text-olive-950"
									key={option}
									type="button"
								>
									{option}
								</button>
							))}
						</ElTabList>
					</div>
					<ElTabPanels>
						{options.map((option) => (
							<div className="flex flex-col gap-2" key={option}>
								{plans[option]}
							</div>
						))}
					</ElTabPanels>
					{footer}
				</Container>
			</ElTabGroup>
		</section>
	);
}
