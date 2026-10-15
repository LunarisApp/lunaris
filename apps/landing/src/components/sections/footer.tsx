import { clsx } from "clsx/lite";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "../elements/container";
import { ProboCookieSettingsLink } from "../elements/probo-cookie-settings-link";

export function FooterCategory({
	title,
	children,
	...props
}: { title: ReactNode } & ComponentProps<"div">) {
	return (
		<div {...props}>
			<h2>{title}</h2>
			<ul className="mt-2 flex flex-col gap-2">{children}</ul>
		</div>
	);
}

export function FooterLink({
	href,
	className,
	...props
}: { href: string } & Omit<ComponentProps<"a">, "href">) {
	return (
		<li className={clsx("text-olive-700 dark:text-olive-400", className)}>
			<Link href={href} {...props} />
		</li>
	);
}

export function FooterCookieSettingsLink({ children }: { children: string }) {
	return (
		<li className="probo-settings-item text-olive-700 dark:text-olive-400">
			<ProboCookieSettingsLink label={children} />
		</li>
	);
}

export function Footer({
	cta,
	links,
	fineprint,
	navigationLabel,
	className,
	...props
}: {
	cta: ReactNode;
	links: ReactNode;
	fineprint: ReactNode;
	navigationLabel: string;
} & ComponentProps<"footer">) {
	return (
		<footer className={clsx("pt-16", className)} {...props}>
			<div className="bg-olive-950/2.5 py-16 text-olive-950 dark:bg-white/5 dark:text-white">
				<Container className="flex flex-col gap-16">
					<div
						className={clsx(
							"grid grid-cols-1 gap-x-6 gap-y-16 text-sm/7",
							cta && "lg:grid-cols-2",
						)}
					>
						{cta}
						<nav
							aria-label={navigationLabel}
							className="grid grid-cols-2 gap-6 wrap-anywhere hyphens-auto sm:has-[>:last-child:nth-child(3)]:grid-cols-3 sm:has-[>:nth-child(5)]:grid-cols-3 md:has-[>:last-child:nth-child(4)]:grid-cols-4 lg:max-xl:has-[>:last-child:nth-child(4)]:grid-cols-2"
						>
							{links}
						</nav>
					</div>
					<div className="flex items-center justify-between gap-10 text-sm/7">
						<div className="text-olive-600 dark:text-olive-400">
							{fineprint}
						</div>
					</div>
				</Container>
			</div>
		</footer>
	);
}
