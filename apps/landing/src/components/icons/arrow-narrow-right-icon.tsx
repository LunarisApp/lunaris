import { clsx } from "clsx/lite";
import type { ComponentProps } from "react";

export function ArrowNarrowRightIcon({
	className,
	...props
}: ComponentProps<"svg">) {
	return (
		<svg
			aria-hidden="true"
			className={clsx("inline-block", className)}
			fill="none"
			height={7}
			strokeWidth={1}
			viewBox="0 0 13 7"
			width={13}
			{...props}
		>
			<path
				d="M12.5049 3.49512L0.504883 3.49512"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9.5 6.5L12.5 3.5L9.5 0.5"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
