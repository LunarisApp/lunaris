import {
	ElTabGroup,
	ElTabList,
	ElTabPanels,
} from "@tailwindplus/elements/react";
import { clsx } from "clsx/lite";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "../elements/container";
import { CheckmarkIcon } from "../icons/checkmark-icon";
import { MinusIcon } from "../icons/minus-icon";

function isPlanRecord<Plan extends string>(
	value: ReactNode | Record<Plan, ReactNode>,
	plan: Plan,
): value is Record<Plan, ReactNode> {
	return typeof value === "object" && value !== null && plan in value;
}

function FeatureGroup<Plan extends string>({
	group,
	plans,
	includedLabel,
	notIncludedLabel,
}: {
	group: {
		title: ReactNode;
		features: { name: ReactNode; value: ReactNode | Record<Plan, ReactNode> }[];
	};
	plans: Plan[];
	includedLabel: string;
	notIncludedLabel: string;
}) {
	return (
		<tbody>
			<tr>
				<th
					className="border-y border-olive-950/10 bg-olive-950/2.5 px-4 pt-10 pb-3 font-semibold text-olive-950 first:border-t-0 dark:border-white/10 dark:bg-white/2.5 dark:text-white"
					colSpan={plans.length + 1}
					scope="colgroup"
				>
					{group.title}
				</th>
			</tr>
			{group.features.map((feature) => (
				<tr className="group" key={String(feature.name)}>
					<th
						className="border-t border-olive-950/5 px-4 py-4 font-normal text-olive-700 group-first:border-olive-950/10 dark:border-white/5 dark:text-olive-400 dark:group-first:border-white/10"
						scope="row"
					>
						{feature.name}
					</th>
					{plans.map((plan) => {
						const value = isPlanRecord(feature.value, plan)
							? feature.value[plan]
							: feature.value;

						return (
							<td
								className="border-t border-olive-950/5 px-3 py-4 text-center text-olive-700 group-first:border-olive-950/10 dark:border-white/10 dark:text-olive-400 dark:group-first:border-white/10"
								key={plan}
							>
								{value === true ? (
									<>
										<CheckmarkIcon className="stroke-olive-700 dark:stroke-olive-300" />
										<span className="sr-only">{includedLabel}</span>
									</>
								) : value === false ? (
									<>
										<MinusIcon className="stroke-olive-500 dark:stroke-olive-500" />
										<span className="sr-only">{notIncludedLabel}</span>
									</>
								) : (
									value
								)}
							</td>
						);
					})}
				</tr>
			))}
		</tbody>
	);
}

export function PlanComparisonTable<const Plan extends string>({
	plans,
	features,
	heading,
	includedLabel,
	notIncludedLabel,
	className,
	...props
}: {
	plans: Plan[];
	heading: ReactNode;
	includedLabel: string;
	notIncludedLabel: string;
	features: {
		title: ReactNode;
		features: { name: ReactNode; value: ReactNode | Record<Plan, ReactNode> }[];
	}[];
} & ComponentProps<"section">) {
	return (
		<section className={clsx("py-16", className)} {...props}>
			<Container>
				<h2 className="mb-6 font-display text-3xl/9 tracking-tight text-olive-950 sm:sr-only dark:text-white">
					{heading}
				</h2>
				<div className="overflow-clip rounded-xl ring-1 ring-olive-950/10 max-sm:hidden dark:ring-white/10">
					<table className="w-full border-separate border-spacing-0 bg-white/20 text-left text-sm/5 dark:bg-white/2.5">
						<colgroup>
							<col className="w-2/5" />
							{plans.map((plan) => (
								<col
									key={plan}
									style={{ width: `calc(60% / ${plans.length})` }}
								/>
							))}
						</colgroup>
						<thead>
							<tr>
								<th className="sticky top-(--scroll-padding-top) z-10 border-b border-olive-950/10 bg-olive-100/95 px-4 py-5 text-base/7 font-medium text-olive-950 backdrop-blur-md dark:border-white/10 dark:bg-olive-950/95 dark:text-white">
									{heading}
								</th>
								{plans.map((plan, index) => (
									<th
										className="sticky top-(--scroll-padding-top) z-10 border-b border-olive-950/10 bg-olive-100/95 p-3 text-center font-semibold text-olive-950 backdrop-blur-md dark:border-white/10 dark:bg-olive-950/95 dark:text-white"
										key={index}
									>
										{plan}
									</th>
								))}
							</tr>
						</thead>
						{features.map((group, index) => (
							<FeatureGroup
								group={group}
								includedLabel={includedLabel}
								key={index}
								notIncludedLabel={notIncludedLabel}
								plans={plans}
							/>
						))}
					</table>
				</div>

				<div className="sm:hidden">
					<ElTabGroup>
						<ElTabList className="grid grid-cols-2 gap-1 rounded-xl bg-olive-950/5 p-1 ring-1 ring-olive-950/5 dark:bg-white/5 dark:ring-white/10">
							{plans.map((plan) => (
								<button
									className="rounded-lg px-3 py-2 text-sm/5 font-medium text-olive-600 transition-colors hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 aria-selected:bg-olive-950 aria-selected:text-white dark:text-olive-400 dark:hover:text-white dark:focus-visible:outline-olive-200 dark:aria-selected:bg-olive-200 dark:aria-selected:text-olive-950"
									key={plan}
									type="button"
								>
									{plan}
								</button>
							))}
						</ElTabList>
						<ElTabPanels>
							{plans.map((plan) => (
								<table
									className="mt-4 w-full border-separate border-spacing-0 overflow-hidden rounded-xl bg-white/20 text-left text-sm/5 ring-1 ring-olive-950/10 dark:bg-white/2.5 dark:ring-white/10"
									key={plan}
								>
									<colgroup>
										<col className="w-3/4" />
										<col className="w-1/4" />
									</colgroup>
									{features.map((group, index) => (
										<FeatureGroup
											group={group}
											includedLabel={includedLabel}
											key={index}
											notIncludedLabel={notIncludedLabel}
											plans={[plan]}
										/>
									))}
								</table>
							))}
						</ElTabPanels>
					</ElTabGroup>
				</div>
			</Container>
		</section>
	);
}
