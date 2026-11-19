import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "../elements/container";
import { ProboCookieSettingsLink } from "../elements/probo-cookie-settings-link";

export function FooterCategory({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div>
			<h2 className="mb-3 font-semibold">{title}</h2>
			<ul className="space-y-1 text-olive-600 dark:text-olive-300">
				{children}
			</ul>
		</div>
	);
}

export function FooterLink({
	href,
	children,
}: {
	href: string;
	children: ReactNode;
}) {
	return (
		<li>
			<Link
				className="inline-block py-1 underline-offset-4 hover:text-olive-950 hover:underline dark:hover:text-white"
				href={href}
			>
				{children}
			</Link>
		</li>
	);
}

export function FooterCookieSettingsLink({ children }: { children: string }) {
	return (
		<li className="probo-settings-item py-1">
			<ProboCookieSettingsLink label={children} />
		</li>
	);
}

export function Footer({
	links,
	fineprint,
	navigationLabel,
	id,
}: {
	links: ReactNode;
	fineprint: ReactNode;
	navigationLabel: string;
	id?: string;
}) {
	return (
		<footer
			id={id}
			className="border-t border-olive-950/10 bg-olive-50 text-olive-950 dark:border-white/10 dark:bg-olive-900 dark:text-white"
		>
			<Container>
				<nav
					aria-label={navigationLabel}
					className="grid grid-cols-2 gap-x-6 gap-y-8 py-12 text-sm/6 wrap-anywhere sm:grid-cols-3 lg:grid-cols-5 lg:py-16"
				>
					{links}
				</nav>
				<div className="border-t border-olive-950/10 py-5 text-sm/6 text-olive-600 dark:border-white/10 dark:text-olive-400">
					{fineprint}
				</div>
			</Container>
		</footer>
	);
}
