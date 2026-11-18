"use client";

import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@lunarisapp/ui/components/navigation-menu";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string };
type NavGroup = { label: string; links: NavLink[] };

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
								<NavigationMenuContent>
									<ul className="w-max min-w-48 max-w-72 p-1">
										{group.links.map((link) => (
											<li key={link.href}>
												<NavigationMenuLink
													className="min-h-10 px-3"
													closeOnClick
													render={<Link href={link.href} />}
												>
													{link.label}
												</NavigationMenuLink>
											</li>
										))}
									</ul>
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
							<div
								key={group.label}
								className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-3 border-b border-olive-950/10 py-4 dark:border-white/10"
							>
								<h2 className="pt-2.5 font-display text-2xl leading-tight">
									{group.label}
								</h2>
								<ul>
									{group.links.map((link) => (
										<li key={link.href}>
											<Link
												className="flex min-h-11 items-center py-1 text-sm font-medium hover:underline"
												href={link.href}
												onClick={() => mobile.current?.close()}
											>
												{link.label}
											</Link>
										</li>
									))}
								</ul>
							</div>
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
