import { clsx } from "clsx/lite";
import type { ComponentProps } from "react";

export function CheckmarkIcon({ className, ...props }: ComponentProps<"svg">) {
	return (
		<svg
			aria-hidden="true"
			className={clsx("inline-block", className)}
			fill="none"
			height={13}
			stroke="currentColor"
			strokeWidth={1}
			viewBox="0 0 13 13"
			width={13}
			{...props}
		>
			<path
				d="M1.5 6.5L5.5 11.5L11.5 1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
