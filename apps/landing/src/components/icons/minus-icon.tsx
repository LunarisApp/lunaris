import { clsx } from "clsx/lite";
import type { ComponentProps } from "react";

export function MinusIcon({ className, ...props }: ComponentProps<"svg">) {
	return (
		<svg
			aria-hidden="true"
			className={clsx("inline-block", className)}
			fill="none"
			height={1}
			stroke="currentColor"
			strokeWidth={1}
			viewBox="0 0 13 1"
			width={13}
			{...props}
		>
			<path
				d="M12.505.5h-12"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
