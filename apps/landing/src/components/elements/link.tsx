import { clsx } from "clsx/lite";
import NextLink from "next/link";
import type { ComponentProps } from "react";

export function Link({
	href,
	className,
	...props
}: {
	href: string;
} & Omit<ComponentProps<"a">, "href">) {
	return (
		<NextLink
			className={clsx(
				"inline-flex items-center gap-2 text-sm/7 font-medium text-olive-950 dark:text-white",
				className,
			)}
			href={href}
			{...props}
		/>
	);
}
