import { clsx } from "clsx/lite";
import type { ReactNode } from "react";
import { TrackedButtonLink } from "@/components/analytics/tracked-button-link";
import { Container } from "@/components/elements/container";
import { Heading } from "@/components/elements/heading";
import {
	ProductIcon,
	type ProductIconName,
} from "@/components/elements/product-icon";
import { Text } from "@/components/elements/text";
import { CallToActionSimpleCentered } from "@/components/sections/call-to-action-simple-centered";

export type ComparisonGroup = {
	title: string;
	features: readonly {
		name: string;
		values: readonly [ReactNode, ReactNode];
	}[];
};

export type ComparisonProduct = {
	id: ProductIconName;
	name: string;
};

type ComparisonCopy = {
	headline: string;
	subheadline: string;
	primaryCta: string;
	table: { heading: string };
	sources: { intro: string };
	cta: {
		headline: string;
		subheadline: string;
	};
};

type ProductComparisonProps = {
	analyticsId: string;
	copy: ComparisonCopy;
	groups: readonly ComparisonGroup[];
	products: readonly [ComparisonProduct, ComparisonProduct];
	sources: readonly { href: string; label: string }[];
};

export function ProductComparison({
	analyticsId,
	copy,
	groups,
	products,
	sources,
}: ProductComparisonProps) {
	return (
		<>
			<section className="pt-12 pb-10 sm:pt-20 sm:pb-16">
				<Container className="flex flex-col items-center">
					<Heading className="max-w-5xl text-center">{copy.headline}</Heading>
					<Text className="mt-6 max-w-2xl text-center text-pretty" size="lg">
						<p>
							<span className="mr-1.5 inline-flex items-center gap-1.5 align-middle">
								{products.map((product, index) => (
									<span className="contents" key={product.id}>
										{index > 0 && (
											<span className="text-sm font-medium text-olive-600 dark:text-olive-400">
												vs
											</span>
										)}
										<span className="inline-flex items-center gap-1.5 rounded-full bg-olive-950/5 px-2.5 py-1 text-sm/5 font-semibold text-olive-950 ring-1 ring-olive-950/10 ring-inset dark:bg-white/7.5 dark:text-white dark:ring-white/10">
											<ProductIcon className="size-4" name={product.id} />
											{product.name}
										</span>
									</span>
								))}
							</span>
							<span aria-hidden="true">— </span>
							{copy.subheadline}
						</p>
					</Text>
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: `${analyticsId}_hero`,
						}}
						className="mt-8"
						href="https://web.lunaris.app"
						size="lg"
					>
						{copy.primaryCta}
					</TrackedButtonLink>
				</Container>
			</section>

			<section className="py-10 sm:py-16" id="comparison">
				<Container>
					<table className="hidden w-full border-collapse text-left text-sm/6 md:table">
						<caption className="sr-only">{copy.table.heading}</caption>
						<colgroup>
							<col className="w-[30%]" />
							<col className="w-[35%]" />
							<col className="w-[35%]" />
						</colgroup>
						<thead>
							<tr>
								<th
									className="sticky top-(--scroll-padding-top) z-[1] bg-olive-100 py-5 pr-3 text-base/7 font-medium text-olive-950 dark:bg-olive-950 dark:text-white"
									scope="col"
								>
									{copy.table.heading}
								</th>
								{products.map((product, index) => (
									<th
										className={clsx(
											"sticky top-(--scroll-padding-top) z-[1] p-3 text-left font-semibold text-olive-950 dark:text-white",
											index === 0
												? "bg-olive-200 dark:bg-olive-900"
												: "bg-olive-100 dark:bg-olive-950",
										)}
										key={product.id}
										scope="col"
									>
										<span className="inline-flex items-center gap-2">
											<ProductIcon className="size-5" name={product.id} />
											{product.name}
										</span>
									</th>
								))}
							</tr>
						</thead>
						{groups.map((group) => (
							<tbody key={group.title}>
								<tr>
									<th
										className="border-y border-olive-950/10 pt-10 pb-4 font-semibold text-olive-950 dark:border-white/10 dark:text-white"
										colSpan={3}
										scope="rowgroup"
									>
										{group.title}
									</th>
								</tr>
								{group.features.map((feature) => (
									<tr className="group" key={feature.name}>
										<th
											className="border-t border-olive-950/5 py-4 pr-3 font-normal text-olive-700 group-first:border-olive-950/10 dark:border-white/5 dark:text-olive-400 dark:group-first:border-white/10"
											scope="row"
										>
											{feature.name}
										</th>
										{feature.values.map((value, index) => (
											<td
												className={clsx(
													"border-t border-olive-950/5 px-3 py-4 group-first:border-olive-950/10 dark:border-white/5 dark:group-first:border-white/10",
													index === 0
														? "bg-olive-950/[0.025] text-olive-800 dark:bg-white/[0.025] dark:text-olive-300"
														: "text-olive-700 dark:text-olive-400",
												)}
												key={products[index].id}
											>
												{value}
											</td>
										))}
									</tr>
								))}
							</tbody>
						))}
					</table>

					<div className="md:hidden">
						<h2 className="text-base/7 font-semibold text-olive-950 dark:text-white">
							{copy.table.heading}
						</h2>
						{groups.map((group) => (
							<section className="mt-10" key={group.title}>
								<h3 className="border-b border-olive-950/10 pb-3 text-sm/6 font-semibold text-olive-950 dark:border-white/10 dark:text-white">
									{group.title}
								</h3>
								{group.features.map((feature) => (
									<div
										className="border-b border-olive-950/5 py-5 dark:border-white/5"
										key={feature.name}
									>
										<h4 className="text-sm/6 font-medium text-olive-950 dark:text-white">
											{feature.name}
										</h4>
										<dl className="mt-3 space-y-3">
											{feature.values.map((value, index) => (
												<div
													className="grid grid-cols-[5rem_1fr] gap-3 text-sm/6"
													key={products[index].id}
												>
													<dt className="font-semibold text-olive-950 dark:text-white">
														<span className="inline-flex items-center gap-1.5">
															<ProductIcon
																className="size-4"
																name={products[index].id}
															/>
															{products[index].name}
														</span>
													</dt>
													<dd
														className={clsx(
															index === 0
																? "text-olive-800 dark:text-olive-300"
																: "text-olive-700 dark:text-olive-400",
														)}
													>
														{value}
													</dd>
												</div>
											))}
										</dl>
									</div>
								))}
							</section>
						))}
					</div>
				</Container>
			</section>

			<section className="pt-2 pb-8 sm:pt-4 sm:pb-12">
				<Container>
					<div className="border-t border-olive-950/10 pt-6 text-sm/6 text-olive-600 dark:border-white/10 dark:text-olive-400">
						<p className="max-w-3xl">{copy.sources.intro}</p>
						<ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
							{sources.map((source) => (
								<li key={source.href}>
									<a
										className="rounded-sm underline decoration-olive-400 underline-offset-4 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 dark:hover:text-white dark:focus-visible:outline-olive-300"
										href={source.href}
									>
										{source.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				</Container>
			</section>

			<CallToActionSimpleCentered
				cta={
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: `${analyticsId}_bottom`,
						}}
						href="https://web.lunaris.app"
						size="lg"
					>
						{copy.primaryCta}
					</TrackedButtonLink>
				}
				headline={copy.cta.headline}
				subheadline={<p>{copy.cta.subheadline}</p>}
			/>
		</>
	);
}
