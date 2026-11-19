"use client";

import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@lunarisapp/ui/components/navigation-menu";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
	ArrowDown01Icon,
	BookOpen01Icon,
	ComputerTerminal01Icon,
	DashboardSquare01Icon,
	HugeiconsIcon,
	PlaySquareIcon,
	ServerStack01Icon,
	SourceCodeIcon,
	Mail01Icon,
} from "@lunarisapp/ui/icons";
import Link from "next/link";
import { McpIcon } from "@/components/icons/harness-icons";
import { type ReactNode, useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string };
const icons = {
	tour: PlaySquareIcon,
	extensions: DashboardSquare01Icon,
	mcp: <McpIcon variant="mono" />,
	cli: ComputerTerminal01Icon,
	sdk: SourceCodeIcon,
	hosting: ServerStack01Icon,
	docs: BookOpen01Icon,
	contact: Mail01Icon,
};

export type NavGroup = {
	label: string;
	links: (NavLink & { icon: keyof typeof icons; description: string })[];
	related: { label: string; links: NavLink[] };
};

function MenuPanel({
	group,
	closeMobile,
}: {
	group: NavGroup;
	closeMobile?: () => void;
}) {
	function panelLink(link: NavLink, className: string, children: ReactNode) {
		return closeMobile ? (
			<Link href={link.href} onClick={closeMobile} className={className}>
				{children}
			</Link>
		) : (
			<NavigationMenuLink
				closeOnClick
				render={<Link href={link.href} />}
				className={className}
			>
				{children}
			</NavigationMenuLink>
		);
	}

	return (
		<div className="grid lg:w-[35rem] lg:grid-cols-[1.55fr_1fr]">
			<ul className="pb-2 lg:p-3">
				{group.links.map((link) => (
					<li key={link.href}>
						{panelLink(
							link,
							"flex items-start gap-3 rounded-md px-2 py-3 hover:bg-muted focus-visible:bg-muted lg:px-3",
							<>
								<span aria-hidden="true" className="mt-0.5 flex shrink-0">
									<Icon
										icon={icons[link.icon]}
										strokeWidth={1.6}
										className="size-5"
									/>
								</span>
								<span>
									<span className="block text-base/5 font-semibold">
										{link.label}
									</span>
									<span className="mt-1 block text-sm/5 text-olive-600 dark:text-olive-400">
										{link.description}
									</span>
								</span>
							</>,
						)}
					</li>
				))}
			</ul>
			<div className="border-t border-current/10 py-3 lg:rounded-r-lg lg:border-t-0 lg:border-l lg:bg-olive-950/[.025] lg:p-4 dark:lg:bg-white/[.045]">
				<h3 className="px-2 pb-1 text-xs/5 font-medium text-olive-600 dark:text-olive-400">
					{group.related.label}
				</h3>
				<ul>
					{group.related.links.map((link) => (
						<li key={link.href}>
							{panelLink(
								link,
								"flex min-h-11 items-center rounded-md px-2 text-sm font-medium hover:bg-muted focus-visible:bg-muted lg:min-h-9",
								link.label,
							)}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

const navControl =
	"min-h-11 cursor-pointer px-3 font-medium text-olive-700 hover:text-olive-950 dark:text-olive-300 dark:hover:text-white";

export function NavbarWithLinksAndActions({
	groups,
	directLinks,
	homeHref,
	logo,
	appLink,
	settings,
	navigationLabel,
	openMenuLabel,
	closeMenuLabel,
}: {
	groups: NavGroup[];
	directLinks: NavLink[];
	homeHref: string;
	logo: ReactNode;
	appLink: ReactNode;
	settings: ReactNode;
	navigationLabel: string;
	openMenuLabel: string;
	closeMenuLabel: string;
}) {
	const [openGroup, setOpenGroup] = useState<string | null>(null);
	const mobile = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const wide = window.matchMedia("(min-width: 64rem)");
		function closeOnResize() {
			if (wide.matches) mobile.current?.close();
			else setOpenGroup(null);
		}
		wide.addEventListener("change", closeOnResize);
		return () => wide.removeEventListener("change", closeOnResize);
	}, []);

	return (
		<header
			id="navbar"
			className="sticky top-0 z-30 border-b border-olive-950/10 bg-olive-100/90 backdrop-blur-lg dark:border-white/10 dark:bg-olive-950/90"
		>
			<nav
				aria-label={navigationLabel}
				className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-6 lg:h-[4.5rem] lg:px-10"
			>
				<Link className="inline-flex shrink-0" href={homeHref}>
					{logo}
				</Link>
				<NavigationMenu
					className="hidden flex-none lg:flex"
					onValueChange={setOpenGroup}
					render={<div />}
					value={openGroup}
				>
					<NavigationMenuList className="gap-1">
						{groups.map((group) => (
							<NavigationMenuItem key={group.label} value={group.label}>
								<NavigationMenuTrigger className={navControl}>
									{group.label}
								</NavigationMenuTrigger>
								<NavigationMenuContent className="p-0">
									<MenuPanel group={group} />
								</NavigationMenuContent>
							</NavigationMenuItem>
						))}
						{directLinks.map((link) => (
							<NavigationMenuItem key={link.href}>
								<NavigationMenuLink
									className={navControl}
									closeOnClick
									render={<Link href={link.href} />}
								>
									{link.label}
								</NavigationMenuLink>
							</NavigationMenuItem>
						))}
					</NavigationMenuList>
				</NavigationMenu>
				<div className="flex items-center gap-1.5 lg:gap-2">
					{settings}
					<div className="ml-2 hidden lg:block">{appLink}</div>
					<button
						aria-label={openMenuLabel}
						aria-haspopup="dialog"
						aria-controls="mobile-menu"
						className="grid size-11 place-items-center rounded-full text-olive-950 hover:bg-olive-200 lg:hidden dark:text-white dark:hover:bg-olive-800"
						type="button"
						onClick={() => mobile.current?.showModal()}
					>
						<svg
							aria-hidden="true"
							className="size-5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							viewBox="0 0 24 24"
						>
							<path d="M3 8h18M3 16h18" strokeLinecap="round" />
						</svg>
					</button>
				</div>
				<dialog
					id="mobile-menu"
					ref={mobile}
					aria-label={navigationLabel}
					className="fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-y-auto overscroll-contain bg-olive-100 text-olive-950 backdrop:bg-olive-950/35 dark:bg-olive-950 dark:text-white"
				>
					<div className="flex h-16 items-center justify-between border-b border-olive-950/10 px-6 dark:border-white/10">
						<Link
							className="inline-flex shrink-0"
							href={homeHref}
							onClick={() => mobile.current?.close()}
						>
							{logo}
						</Link>
						<button
							aria-label={closeMenuLabel}
							className="grid size-11 place-items-center rounded-full hover:bg-olive-200 dark:hover:bg-olive-800"
							type="button"
							onClick={() => mobile.current?.close()}
						>
							<svg
								aria-hidden="true"
								className="size-5"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.6"
								viewBox="0 0 24 24"
							>
								<path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
							</svg>
						</button>
					</div>
					<div className="mx-auto max-w-lg px-6 pb-8">
						{groups.map((group) => (
							<details
								key={group.label}
								name="mobile-navigation"
								className="group border-b border-current/10"
							>
								<summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 text-xl font-medium [&::-webkit-details-marker]:hidden">
									{group.label}
									<HugeiconsIcon
										aria-hidden="true"
										icon={ArrowDown01Icon}
										className="size-4 group-open:rotate-180"
									/>
								</summary>
								<MenuPanel
									group={group}
									closeMobile={() => mobile.current?.close()}
								/>
							</details>
						))}
						<div className="flex items-start justify-between gap-3 pt-4">
							<div className="grid">
								{directLinks.map((link) => (
									<Link
										key={link.href}
										className="flex min-h-11 items-center font-display text-2xl hover:underline"
										href={link.href}
										onClick={() => mobile.current?.close()}
									>
										{link.label}
									</Link>
								))}
							</div>
							{appLink}
						</div>
					</div>
				</dialog>
			</nav>
		</header>
	);
}
