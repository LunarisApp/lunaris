import { clsx } from "clsx/lite";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "../elements/container";
import { Heading } from "../elements/heading";
import { Text } from "../elements/text";

export function HeroCenteredWithDemo({
	eyebrow,
	headline,
	subheadline,
	cta,
	demo,
	footer,
	className,
	...props
}: {
	eyebrow?: ReactNode;
	headline: ReactNode;
	subheadline: ReactNode;
	cta?: ReactNode;
	demo?: ReactNode;
	footer?: ReactNode;
} & ComponentProps<"section">) {
	return (
		<section
			className={clsx("px-2 pt-12 pb-16 sm:pt-20 sm:pb-24", className)}
			{...props}
		>
			<Container className="flex flex-col items-center gap-6">
				{eyebrow}
				<Heading className="w-full max-w-5xl text-center wrap-anywhere hyphens-auto">
					{headline}
				</Heading>
				<Text className="flex max-w-2xl flex-col gap-4 text-center" size="lg">
					{subheadline}
				</Text>
				{cta}
			</Container>

			{demo ? (
				<Container className="mt-14 sm:mt-20">
					<div className="rounded-xl bg-olive-300/70 p-1.5 shadow-[0_30px_90px_-35px_rgba(31,31,27,0.55)] ring-1 ring-olive-950/10 sm:rounded-2xl sm:p-2 dark:bg-white/10 dark:ring-white/15">
						<div className="overflow-hidden rounded-lg bg-olive-950 ring-1 ring-black/15 sm:rounded-xl [&>*]:block [&>*]:h-auto [&>*]:w-full">
							{demo}
						</div>
					</div>
				</Container>
			) : null}

			{footer ? <Container className="mt-16">{footer}</Container> : null}
		</section>
	);
}
