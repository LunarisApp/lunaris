import { clsx } from "clsx/lite";
import type { ComponentProps } from "react";

export function Heading({
	children,
	color = "dark/light",
	className,
	...props
}: { color?: "dark/light" | "light" } & ComponentProps<"h1">) {
	return (
		<h1
			className={clsx(
				"font-display text-4xl/none tracking-tight text-balance sm:text-6xl/none",
				color === "dark/light" && "text-olive-950 dark:text-white",
				color === "light" && "text-white",
				className,
			)}
			{...props}
		>
			{children}
		</h1>
	);
}
