import { ElDialog, ElDialogPanel } from "@tailwindplus/elements/react";
import { clsx } from "clsx/lite";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function NavbarLink({
	children,
	href,
	className,
	...props
}: { href: string } & Omit<ComponentProps<"a">, "href">) {
	return (
		<Link
			className={clsx(
				"group inline-flex items-center justify-between gap-2 text-3xl/10 font-medium text-olive-950 lg:text-sm/7 dark:text-white",
				className,
			)}
			href={href}
			{...props}
		>
			{children}
			<span
				aria-hidden="true"
				className="inline-flex p-1.5 opacity-0 group-hover:opacity-100 lg:hidden"
			>
				<svg
					aria-hidden="true"
					className="size-6"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						d="m8.25 4.5 7.5 7.5-7.5 7.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</span>
		</Link>
	);
}

export function NavbarLogo({
	className,
	href,
	...props
}: { href: string } & Omit<ComponentProps<"a">, "href">) {
	return (
		<Link
			href={href}
			{...props}
			className={clsx("inline-flex items-stretch", className)}
		/>
	);
}

export function NavbarWithLinksActionsAndCenteredLogo({
	links,
	logo,
	actions,
	navigationLabel,
	openMenuLabel,
	closeMenuLabel,
	className,
	...props
}: {
	links: ReactNode;
	logo: ReactNode;
	actions: ReactNode;
	navigationLabel: string;
	openMenuLabel: string;
	closeMenuLabel: string;
} & ComponentProps<"header">) {
	return (
		<header
			className={clsx(
				"sticky top-0 z-10 bg-olive-100 dark:bg-olive-950",
				className,
			)}
			{...props}
		>
			<style>{`:root { --scroll-padding-top: 5.25rem }`}</style>
			<nav aria-label={navigationLabel}>
				<div className="mx-auto flex h-(--scroll-padding-top) max-w-7xl items-center gap-4 px-6 lg:px-10">
					<div className="flex flex-1 gap-8 max-lg:hidden">{links}</div>
					<div className="flex items-center">{logo}</div>
					<div className="flex flex-1 items-center justify-end gap-4">
						<div className="flex shrink-0 items-center gap-5">{actions}</div>

						<button
							aria-label={openMenuLabel}
							className="inline-flex rounded-full p-1.5 text-olive-950 hover:bg-olive-950/10 lg:hidden dark:text-white dark:hover:bg-white/10"
							command="show-modal"
							commandfor="mobile-menu"
							type="button"
						>
							<svg
								aria-hidden="true"
								className="size-6"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									clipRule="evenodd"
									d="M3.748 8.248a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1-.75-.75ZM3.748 15.75a.75.75 0 0 1 .75-.751h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1-.75-.75Z"
									fillRule="evenodd"
								/>
							</svg>
						</button>
					</div>
				</div>

				<ElDialog className="lg:hidden">
					<dialog
						aria-label={navigationLabel}
						className="backdrop:bg-transparent"
						id="mobile-menu"
					>
						<ElDialogPanel className="fixed inset-0 overflow-y-auto bg-olive-100 px-6 py-6 lg:px-10 dark:bg-olive-950">
							<div className="flex justify-end">
								<button
									aria-label={closeMenuLabel}
									className="inline-flex rounded-full p-1.5 text-olive-950 hover:bg-olive-950/10 dark:text-white dark:hover:bg-white/10"
									command="close"
									commandfor="mobile-menu"
									type="button"
								>
									<svg
										aria-hidden="true"
										className="size-6"
										fill="none"
										stroke="currentColor"
										strokeWidth={1.5}
										viewBox="0 0 24 24"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M6 18 18 6M6 6l12 12"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
							</div>
							<div className="mt-6 flex flex-col gap-6">{links}</div>
						</ElDialogPanel>
					</dialog>
				</ElDialog>
			</nav>
		</header>
	);
}
