import { clsx } from "clsx/lite";
import type { ComponentProps } from "react";

export function PlusIcon({ className, ...props }: ComponentProps<"svg">) {
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
			<path d="M6.5 0.5V12.5" strokeLinecap="round" strokeLinejoin="round" />
			<path
				d="M12.5049 6.49512L0.504883 6.49512"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
